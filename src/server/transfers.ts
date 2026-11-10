import { type CardCategory, Prisma } from "@/generated/prisma/client";
import { alertNewListing } from "./watchlist";
import { cryptoRandom } from "@/domain/random";
import { finishOdds, rollFinish } from "./finishes";
import { z } from "zod";
import { audit } from "./audit";
import { lockOwnedCard } from "./cards";
import { type Tx, db, withTx } from "./db";
import { DomainError } from "./errors";
import { requireFlag } from "./flags";
import { cardsTradeableNow } from "./launch";
import { latestValues } from "./valuation";
import { credit, debit, fmtMp, lockWallet, release } from "./wallet";

/**
 * Transfers: peer-to-peer trading and house auctions. Everything is priced in MX (never £).
 *
 *  - Prices are 0.10–100.00 MX. MATCHX takes a 5% fee from the seller on every sale.
 *  - MX is never withdrawable, so any MX (bonus first) can buy, offer and bid. Sale proceeds are MX.
 *  - House listings: MATCHX lists cards straight from circulation at a fixed buy-now price
 *    (no offers). The card is RESERVED while listed and the MX goes to the house.
 *  - Offers and bids hold the buyer's MX immediately (a negative ledger entry) and release it if
 *    the offer is declined/withdrawn/lapses or the bid is beaten. Held MX can't be spent twice.
 *
 * LEGAL GATE: all of it requires the MARKET flag (only switchable once LEGAL_GATES_CLEARED lists it).
 */
export const MIN_PRICE_MINOR = 10; // 0.10 MX
export const MAX_PRICE_MINOR = 10_000; // 100.00 MX
export const FEE_BPS = 500; // 5%

export const feeFor = (priceMinor: number) => Math.max(1, Math.round((priceMinor * FEE_BPS) / 10_000));
const clampPrice = (m: number) => Math.min(MAX_PRICE_MINOR, Math.max(MIN_PRICE_MINOR, Math.round(m)));

const price = z.number().int().min(MIN_PRICE_MINOR, "The minimum price is 0.10 MX").max(MAX_PRICE_MINOR, "The maximum price is 100 MX");

export const ListingSchema = z.object({
  cardId: z.string().uuid(),
  askingPriceMinor: price,
  days: z.number().int().min(1).max(14).default(7),
});

// ───────────── Pricing guidance ─────────────

/** Average P2P selling price per player+tier over the last `days` (null when no sales). */
export async function averageSalePrices(keys: Array<{ playerId: string; category: CardCategory }>, days = 90) {
  const out = new Map<string, { avgMinor: number; sales: number }>();
  if (!keys.length) return out;
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.$queryRaw<Array<{ playerId: string; category: CardCategory; avg: number; n: bigint }>>`
    SELECT t."playerId", t.category, AVG(l."soldPriceMinor")::float AS avg, COUNT(*) AS n
    FROM "MarketListing" l
    JOIN "CardInstance" c ON c.id = l."cardId"
    JOIN "CardTemplate" t ON t.id = c."templateId"
    WHERE l.status = 'SOLD' AND l."soldAt" >= ${since} AND t."playerId" = ANY(${[...new Set(keys.map((k) => k.playerId))]}::uuid[])
    GROUP BY t."playerId", t.category`;
  for (const r of rows) out.set(`${r.playerId}:${r.category}`, { avgMinor: Math.round(r.avg), sales: Number(r.n) });
  return out;
}

/**
 * Recommended price: the card's current MX valuation, blended 50/50 with the recent average selling
 * price when there have been at least 3 sales. Always within 0.10–100 MX.
 */
export function recommendPrice(valueMp: number | null, avg: { avgMinor: number; sales: number } | undefined) {
  const base = valueMp !== null ? valueMp * 100 : null;
  if (avg && avg.sales >= 3) return clampPrice(base !== null ? (base + avg.avgMinor) / 2 : avg.avgMinor);
  return base !== null ? clampPrice(base) : avg ? clampPrice(avg.avgMinor) : MIN_PRICE_MINOR * 10;
}

/** All-time value history (MX valuation per day) for a player+tier, for the small transfer graph. */
export async function valueHistory(playerId: string, category: CardCategory) {
  const rows = await db.mPValuation.findMany({ where: { playerId, category }, orderBy: { computedAt: "asc" }, select: { valueMp: true, computedAt: true } });
  return rows.map((r) => ({ t: r.computedAt.toISOString(), mp: r.valueMp }));
}

// ───────────── Listings ─────────────

export async function createListing(userId: string, input: z.input<typeof ListingSchema>) {
  await requireFlag("MARKET");
  const data = ListingSchema.parse(input);
  const listing = await withTx(async (tx) => {
    const card = await lockOwnedCard(tx, userId, data.cardId);
    if (card.tradeStatus !== "TRADEABLE") throw new DomainError("NOT_TRADEABLE", "This card can't be traded.");
    if (card.lock !== "NONE") throw new DomainError("CARD_BUSY", "This card is already listed or in a match.");
    const listing = await tx.marketListing.create({
      data: { cardId: data.cardId, sellerId: userId, askingPriceMinor: data.askingPriceMinor, currency: "MX", expiresAt: new Date(Date.now() + data.days * 86_400_000) },
    });
    await tx.cardInstance.update({ where: { id: data.cardId }, data: { lock: "LISTED", lockRef: listing.id } });
    return listing;
  });
  // Tell anyone watching this player (outside the transaction — alerts never block a listing).
  const card = await db.cardInstance.findUniqueOrThrow({ where: { id: data.cardId }, select: { template: { select: { playerId: true, player: { select: { displayName: true } } } } } });
  await alertNewListing({ id: listing.id, sellerId: userId, askingPriceMinor: listing.askingPriceMinor, playerId: card.template.playerId, playerName: card.template.player.displayName });
  return listing;
}

async function lockListing(tx: Tx, listingId: string) {
  const [l] = await tx.$queryRaw<Array<{ id: string; status: string; cardId: string; sellerId: string | null; house: boolean; askingPriceMinor: number; expiresAt: Date; liveAt: Date | null }>>`
    SELECT id, status, "cardId", "sellerId", house, "askingPriceMinor", "expiresAt", "liveAt" FROM "MarketListing" WHERE id = ${listingId}::uuid FOR UPDATE`;
  return l;
}

/** Lock both wallets in a fixed order so two simultaneous trades can't deadlock. */
async function lockWallets(tx: Tx, ...userIds: Array<string | null>) {
  for (const id of [...new Set(userIds.filter((u): u is string => !!u))].sort()) await lockWallet(tx, id);
}

/** Release every pending offer on a listing (status → LAPSED unless one is being accepted). */
async function lapseOffers(tx: Tx, listingId: string, exceptOfferId?: string) {
  const pending = await tx.marketOffer.findMany({ where: { listingId, status: "PENDING", id: exceptOfferId ? { not: exceptOfferId } : undefined } });
  for (const o of pending) {
    await release(tx, { userId: o.buyerId, refId: `offer:${o.id}`, kind: "OFFER_RELEASE", note: "Offer lapsed — MX returned" });
    await tx.marketOffer.update({ where: { id: o.id }, data: { status: "LAPSED", respondedAt: new Date() } });
  }
}

/** Move a listed card to the buyer, pay the seller (minus 5%) and close the listing. */
async function settleSale(tx: Tx, listing: { id: string; cardId: string; sellerId: string | null; house: boolean }, buyerId: string, priceMinor: number) {
  if (listing.house) return settleHouseSale(tx, listing, buyerId, priceMinor);
  if (!listing.sellerId) throw new Error("peer listing without a seller");
  const [card] = await tx.$queryRaw<Array<{ ownerId: string; lock: string; lockRef: string }>>`
    SELECT "ownerId", "lock", "lockRef" FROM "CardInstance" WHERE id = ${listing.cardId}::uuid FOR UPDATE`;
  if (!card || card.ownerId !== listing.sellerId || card.lock !== "LISTED" || card.lockRef !== listing.id) {
    throw new DomainError("NOT_AVAILABLE", "This card is no longer available.");
  }
  const fee = feeFor(priceMinor);
  const now = new Date();
  await credit(tx, { userId: listing.sellerId, amountMinor: priceMinor - fee, kind: "MARKET_SALE", bucket: "BONUS", refId: `listing:${listing.id}:sale`, note: `Sold for ${fmtMp(priceMinor)} (5% fee ${fmtMp(fee)})` });
  await tx.marketListing.update({ where: { id: listing.id }, data: { status: "SOLD", buyerId, soldPriceMinor: priceMinor, soldAt: now, feeMinor: fee } });
  const closed = await tx.cardOwnership.updateMany({
    where: { cardId: listing.cardId, userId: listing.sellerId, releasedAt: null },
    data: { releasedAt: now, releasedVia: "MARKET_SALE", releasedRef: `listing:${listing.id}` },
  });
  if (closed.count !== 1) throw new Error("Seller ownership record missing");
  await tx.cardOwnership.create({ data: { cardId: listing.cardId, userId: buyerId, acquiredVia: "MARKET", acquiredRef: `listing:${listing.id}`, acquiredAt: now } });
  await tx.cardInstance.update({ where: { id: listing.cardId }, data: { ownerId: buyerId, lock: "NONE", lockRef: null } });
  await tx.favouriteCard.deleteMany({ where: { cardId: listing.cardId } });
  return { fee };
}

/** A house sale: the reserved card leaves circulation and goes to the buyer; the MX goes to MATCHX. */
async function settleHouseSale(tx: Tx, listing: { id: string; cardId: string }, buyerId: string, priceMinor: number) {
  const [card] = await tx.$queryRaw<Array<{ supplyState: string; packable: boolean; category: string; playerId: string }>>`
    SELECT ci."supplyState", ci.packable, t.category::text AS category, t."playerId"
    FROM "CardInstance" ci JOIN "CardTemplate" t ON t.id = ci."templateId" WHERE ci.id = ${listing.cardId}::uuid FOR UPDATE OF ci`;
  if (!card || card.supplyState !== "RESERVED") throw new DomainError("NOT_AVAILABLE", "This card is no longer available.");
  // A player signed from a drop can come out Rainbow (any tier), Diamond or Ruby (Golds), like a pack.
  if (!card.packable) {
    const finish = await rollFinish(tx, cryptoRandom, await finishOdds(), { playerId: card.playerId, cardId: listing.cardId, category: card.category });
    if (finish) await audit(tx, { actorId: buyerId, action: "finish.drop", entityType: "CardInstance", entityId: listing.cardId, after: { ...finish, listingId: listing.id } });
  }
  const now = new Date();
  await tx.marketListing.update({ where: { id: listing.id }, data: { status: "SOLD", buyerId, soldPriceMinor: priceMinor, soldAt: now } });
  await tx.cardOwnership.create({ data: { cardId: listing.cardId, userId: buyerId, acquiredVia: "MARKET", acquiredRef: `listing:${listing.id}`, acquiredAt: now } });
  const tradeStatus = (await cardsTradeableNow()) ? "TRADEABLE" : "NON_TRADEABLE";
  await tx.cardInstance.update({ where: { id: listing.cardId }, data: { supplyState: "HELD", ownerId: buyerId, lock: "NONE", lockRef: null, tradeStatus } });
  return { fee: 0 };
}

/** Close a listing without a sale and free its card (back to the seller, or back into packs for house cards). */
async function closeListing(tx: Tx, l: { id: string; house: boolean; cardId: string }, status: "CANCELLED" | "EXPIRED") {
  await lapseOffers(tx, l.id);
  await tx.marketListing.update({ where: { id: l.id }, data: { status } });
  if (l.house) {
    await tx.cardInstance.updateMany({ where: { id: l.cardId, supplyState: "RESERVED", packable: true }, data: { supplyState: "AVAILABLE" } });
    await tx.cardInstance.updateMany({ where: { id: l.cardId, supplyState: "RESERVED", packable: false }, data: { supplyState: "RETIRED" } });
  }
  else await tx.cardInstance.updateMany({ where: { lock: "LISTED", lockRef: l.id }, data: { lock: "NONE", lockRef: null } });
}

export async function buyNow(buyerId: string, listingId: string) {
  await requireFlag("MARKET");
  return withTx(async (tx) => {
    const l = await lockListing(tx, listingId);
    if (!l || l.status !== "ACTIVE" || l.expiresAt <= new Date()) throw new DomainError("NOT_AVAILABLE", "This listing is no longer available.");
    if (l.liveAt && l.liveAt > new Date()) throw new DomainError("NOT_LIVE", "This player drop isn't live yet.");
    if (l.sellerId === buyerId) throw new DomainError("OWN_LISTING", "You can't buy your own listing.");
    await lockWallets(tx, buyerId, l.sellerId);
    // A buyer with a pending offer on this listing gets that hold back first, then pays in full.
    await lapseOffers(tx, l.id);
    // Player drops are a straight purchase from MATCHX at the price shown: no fee, any MX.
    // Player-to-player transfers use earned MX only (the seller pays the 5% fee).
    await debit(tx, {
      userId: buyerId,
      amountMinor: l.askingPriceMinor,
      kind: "MARKET_PURCHASE",
      refId: `listing:${l.id}:buy`,
      note: l.house ? "Player drop" : "Transfer — buy now",
      earnedOnly: !l.house,
    });
    return settleSale(tx, l, buyerId, l.askingPriceMinor);
  });
}

export async function cancelListing(userId: string, listingId: string) {
  await requireFlag("MARKET");
  return withTx(async (tx) => {
    const l = await lockListing(tx, listingId);
    if (!l || l.house || l.sellerId !== userId || l.status !== "ACTIVE") throw new DomainError("NOT_FOUND", "Listing not found or no longer active.");
    await closeListing(tx, l, "CANCELLED");
  });
}

export async function expireListings(now = new Date()) {
  const expired = await db.marketListing.findMany({ where: { status: "ACTIVE", expiresAt: { lte: now } }, select: { id: true } });
  for (const { id } of expired) {
    await withTx(async (tx) => {
      const l = await lockListing(tx, id);
      if (!l || l.status !== "ACTIVE") return;
      await closeListing(tx, l, "EXPIRED");
    });
  }
  return expired.length;
}

// ───────────── Offers ─────────────

export async function makeOffer(buyerId: string, listingId: string, amountMinor: number) {
  await requireFlag("MARKET");
  price.parse(amountMinor);
  return withTx(async (tx) => {
    const l = await lockListing(tx, listingId);
    if (!l || l.status !== "ACTIVE" || l.expiresAt <= new Date()) throw new DomainError("NOT_AVAILABLE", "This listing is no longer available.");
    if (l.house) throw new DomainError("BUY_NOW_ONLY", "MATCHX listings are buy-now only.");
    if (l.sellerId === buyerId) throw new DomainError("OWN_LISTING", "You can't make an offer on your own listing.");
    if (amountMinor >= l.askingPriceMinor) throw new DomainError("USE_BUY_NOW", "That's at or above the buy-now price — just buy it now.");
    await lockWallet(tx, buyerId);
    const previous = await tx.marketOffer.findFirst({ where: { listingId, buyerId, status: "PENDING" } });
    if (previous) {
      await release(tx, { userId: buyerId, refId: `offer:${previous.id}`, kind: "OFFER_RELEASE", note: "Offer replaced" });
      await tx.marketOffer.update({ where: { id: previous.id }, data: { status: "WITHDRAWN", respondedAt: new Date() } });
    }
    const offer = await tx.marketOffer.create({ data: { listingId, buyerId, amountMinor } });
    await debit(tx, { userId: buyerId, amountMinor, kind: "OFFER_HOLD", refId: `offer:${offer.id}`, note: "Offer — MX held until the seller responds", earnedOnly: true });
    return offer;
  });
}

async function lockOffer(tx: Tx, offerId: string) {
  const [o] = await tx.$queryRaw<Array<{ id: string; listingId: string; buyerId: string; amountMinor: number; status: string }>>`
    SELECT id, "listingId", "buyerId", "amountMinor", status FROM "MarketOffer" WHERE id = ${offerId}::uuid FOR UPDATE`;
  return o;
}

export async function withdrawOffer(buyerId: string, offerId: string) {
  await requireFlag("MARKET");
  return withTx(async (tx) => {
    const o = await lockOffer(tx, offerId);
    if (!o || o.buyerId !== buyerId || o.status !== "PENDING") throw new DomainError("NOT_FOUND", "Offer not found or already answered.");
    await lockWallet(tx, buyerId);
    await release(tx, { userId: buyerId, refId: `offer:${o.id}`, kind: "OFFER_RELEASE", note: "Offer withdrawn — MX returned" });
    await tx.marketOffer.update({ where: { id: o.id }, data: { status: "WITHDRAWN", respondedAt: new Date() } });
  });
}

export async function respondToOffer(sellerId: string, offerId: string, accept: boolean) {
  await requireFlag("MARKET");
  return withTx(async (tx) => {
    const found = await tx.marketOffer.findUnique({ where: { id: offerId }, select: { listingId: true } });
    if (!found) throw new DomainError("NOT_FOUND", "Offer not found.");
    const l = await lockListing(tx, found.listingId); // listing first, then offer: same order as buyNow
    const o = await lockOffer(tx, offerId);
    if (!l || l.sellerId !== sellerId) throw new DomainError("NOT_FOUND", "Offer not found.");
    if (o.status !== "PENDING") throw new DomainError("DONE", "This offer has already been answered.");
    await lockWallets(tx, o.buyerId, sellerId);
    if (!accept) {
      await release(tx, { userId: o.buyerId, refId: `offer:${o.id}`, kind: "OFFER_RELEASE", note: "Offer declined — MX returned" });
      await tx.marketOffer.update({ where: { id: o.id }, data: { status: "DECLINED", respondedAt: new Date() } });
      return { accepted: false };
    }
    if (l.status !== "ACTIVE") throw new DomainError("NOT_AVAILABLE", "This listing is no longer active.");
    // The held MX becomes the payment: release the hold and take the purchase in one step.
    await release(tx, { userId: o.buyerId, refId: `offer:${o.id}`, kind: "OFFER_RELEASE", note: "Offer accepted" });
    await debit(tx, { userId: o.buyerId, amountMinor: o.amountMinor, kind: "MARKET_PURCHASE", refId: `listing:${l.id}:buy`, note: "Transfer — offer accepted", earnedOnly: true });
    await tx.marketOffer.update({ where: { id: o.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
    await lapseOffers(tx, l.id, o.id);
    await settleSale(tx, l, o.buyerId, o.amountMinor);
    return { accepted: true };
  });
}

// ───────────── House auctions ─────────────

export const AuctionSchema = z.object({
  playerId: z.string().uuid(),
  category: z.enum(["BRONZE", "SILVER", "GOLD"]),
  startPriceMinor: price,
  minIncrementMinor: z.number().int().min(1).max(1000).default(10),
  reserveMinor: price.optional(),
  startsAt: z.coerce.date(),
  hours: z.number().min(1).max(24 * 7),
});

/** Admin: take one card of a player+tier out of the pack pool and put it up for auction. */
export async function createAuction(adminId: string, input: z.input<typeof AuctionSchema>) {
  const data = AuctionSchema.parse(input);
  return withTx(async (tx) => {
    const [card] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT c.id FROM "CardInstance" c JOIN "CardTemplate" t ON t.id = c."templateId"
      WHERE t."playerId" = ${data.playerId}::uuid AND t.category = ${data.category}::"CardCategory"
        AND c."supplyState" IN ('AVAILABLE', 'RECIRCULATING')
      ORDER BY c.serial LIMIT 1 FOR UPDATE OF c SKIP LOCKED`;
    if (!card) throw new DomainError("NO_STOCK", "No unowned copy of this card is left in the pool.");
    await tx.cardInstance.update({ where: { id: card.id }, data: { supplyState: "RESERVED" } });
    const a = await tx.auction.create({
      data: {
        cardId: card.id,
        startPriceMinor: data.startPriceMinor,
        minIncrementMinor: data.minIncrementMinor,
        reserveMinor: data.reserveMinor,
        startsAt: data.startsAt,
        endsAt: new Date(data.startsAt.getTime() + data.hours * 3_600_000),
        status: data.startsAt <= new Date() ? "LIVE" : "SCHEDULED",
        createdById: adminId,
      },
    });
    await audit(tx, { actorId: adminId, action: "auction.create", entityType: "Auction", entityId: a.id, after: a });
    return a;
  });
}

export async function placeBid(userId: string, auctionId: string, amountMinor: number, now = new Date()) {
  await requireFlag("MARKET");
  await requireFlag("AUCTIONS");
  price.parse(amountMinor);
  return withTx(async (tx) => {
    const [a] = await tx.$queryRaw<Array<{ id: string; status: string; startsAt: Date; endsAt: Date; startPriceMinor: number; minIncrementMinor: number; antiSnipeMinutes: number }>>`
      SELECT id, status, "startsAt", "endsAt", "startPriceMinor", "minIncrementMinor", "antiSnipeMinutes" FROM "Auction" WHERE id = ${auctionId}::uuid FOR UPDATE`;
    if (!a || !["LIVE", "SCHEDULED"].includes(a.status) || a.startsAt > now || a.endsAt <= now) throw new DomainError("CLOSED", "This auction isn't open for bids.");
    const leading = await tx.auctionBid.findFirst({ where: { auctionId, status: "LEADING" } });
    const min = leading ? leading.amountMinor + a.minIncrementMinor : a.startPriceMinor;
    if (amountMinor < min) throw new DomainError("TOO_LOW", `The minimum bid is ${fmtMp(min)}.`);
    await lockWallets(tx, userId, ...(leading ? [leading.userId] : []));
    // Release the previous leader first (it may be the same manager raising their own bid).
    if (leading) {
      await release(tx, { userId: leading.userId, refId: `bid:${leading.id}`, kind: "AUCTION_RELEASE", note: "Outbid — MX returned" });
      await tx.auctionBid.update({ where: { id: leading.id }, data: { status: "OUTBID" } });
    }
    const bid = await tx.auctionBid.create({ data: { auctionId, userId, amountMinor } });
    await debit(tx, { userId, amountMinor, kind: "AUCTION_HOLD", refId: `bid:${bid.id}`, note: "Auction bid — MX held", earnedOnly: true });
    // Anti-sniping: a late bid pushes the end back so others get a fair chance to respond.
    const snipe = a.antiSnipeMinutes * 60_000;
    const endsAt = a.endsAt.getTime() - now.getTime() < snipe ? new Date(now.getTime() + snipe) : a.endsAt;
    await tx.auction.update({ where: { id: auctionId }, data: { status: "LIVE", endsAt } });
    return { bid, endsAt };
  });
}

/** Close finished auctions: card to the top bidder (if the reserve is met), otherwise back to the pool. */
export async function settleAuctions(now = new Date()) {
  await db.auction.updateMany({ where: { status: "SCHEDULED", startsAt: { lte: now } }, data: { status: "LIVE" } });
  const due = await db.auction.findMany({ where: { status: "LIVE", endsAt: { lte: now } }, select: { id: true } });
  for (const { id } of due) {
    await withTx(async (tx) => {
      const [a] = await tx.$queryRaw<Array<{ id: string; status: string; cardId: string; reserveMinor: number | null; endsAt: Date }>>`
        SELECT id, status, "cardId", "reserveMinor", "endsAt" FROM "Auction" WHERE id = ${id}::uuid FOR UPDATE`;
      if (!a || a.status !== "LIVE" || a.endsAt > now) return;
      const top = await tx.auctionBid.findFirst({ where: { auctionId: id, status: "LEADING" } });
      if (!top || (a.reserveMinor !== null && top.amountMinor < a.reserveMinor)) {
        if (top) {
          await lockWallet(tx, top.userId);
          await release(tx, { userId: top.userId, refId: `bid:${top.id}`, kind: "AUCTION_RELEASE", note: "Reserve not met — MX returned" });
          await tx.auctionBid.update({ where: { id: top.id }, data: { status: "RELEASED" } });
        }
        await tx.cardInstance.update({ where: { id: a.cardId }, data: { supplyState: "AVAILABLE" } });
        await tx.auction.update({ where: { id }, data: { status: "UNSOLD", settledAt: now } });
        return;
      }
      await lockWallet(tx, top.userId);
      await release(tx, { userId: top.userId, refId: `bid:${top.id}`, kind: "AUCTION_RELEASE", note: "Auction won" });
      await debit(tx, { userId: top.userId, amountMinor: top.amountMinor, kind: "MARKET_PURCHASE", refId: `auction:${id}:win`, note: "Auction won", earnedOnly: true });
      await tx.auctionBid.update({ where: { id: top.id }, data: { status: "WON" } });
      const tradeStatus = (await cardsTradeableNow()) ? "TRADEABLE" : "NON_TRADEABLE";
      await tx.cardInstance.update({ where: { id: a.cardId }, data: { supplyState: "HELD", ownerId: top.userId, lock: "NONE", lockRef: null, tradeStatus } });
      await tx.cardOwnership.create({ data: { cardId: a.cardId, userId: top.userId, acquiredVia: "MARKET", acquiredRef: `auction:${id}`, acquiredAt: now } });
      await tx.auction.update({ where: { id }, data: { status: "SETTLED", winnerId: top.userId, winningBidMinor: top.amountMinor, settledAt: now } });
    });
  }
  return due.length;
}

export async function cancelAuction(adminId: string, auctionId: string) {
  return withTx(async (tx) => {
    const [a] = await tx.$queryRaw<Array<{ id: string; status: string; cardId: string }>>`
      SELECT id, status, "cardId" FROM "Auction" WHERE id = ${auctionId}::uuid FOR UPDATE`;
    if (!a || !["LIVE", "SCHEDULED"].includes(a.status)) throw new DomainError("DONE", "This auction has already closed.");
    const top = await tx.auctionBid.findFirst({ where: { auctionId, status: "LEADING" } });
    if (top) {
      await lockWallet(tx, top.userId);
      await release(tx, { userId: top.userId, refId: `bid:${top.id}`, kind: "AUCTION_RELEASE", note: "Auction cancelled — MX returned" });
      await tx.auctionBid.update({ where: { id: top.id }, data: { status: "RELEASED" } });
    }
    await tx.cardInstance.update({ where: { id: a.cardId }, data: { supplyState: "AVAILABLE" } });
    await tx.auction.update({ where: { id: auctionId }, data: { status: "CANCELLED", settledAt: new Date() } });
    await audit(tx, { actorId: adminId, action: "auction.cancel", entityType: "Auction", entityId: auctionId });
  });
}

// ───────────── House listings (MATCHX sells from circulation) ─────────────

export const HouseStockSchema = z
  .object({
    tier: z.enum(["BRONZE", "SILVER", "GOLD"]),
    count: z.number().int().min(1).max(200),
    /** Fixed price for every card. */
    priceMinor: price.nullable().default(null),
    /** Price range: the best player gets the max, the weakest the min, curving down in between. */
    minPriceMinor: price.nullable().default(null),
    maxPriceMinor: price.nullable().default(null),
    /** % on top of the recommended price (when no fixed price or range is given). */
    markupPct: z.number().min(-50).max(200).default(0),
    days: z.number().int().min(1).max(30).default(7),
    leagues: z.array(z.string()).optional(),
  })
  .refine((d) => (d.minPriceMinor === null) === (d.maxPriceMinor === null), "Give both a minimum and a maximum price, or neither")
  .refine((d) => d.minPriceMinor === null || d.maxPriceMinor === null || d.minPriceMinor <= d.maxPriceMinor, "The minimum price is above the maximum");

/**
 * How good a player is, for ordering prices within a range: real market value when we have it,
 * otherwise league level, a first-team shirt number (1–11) and the card's current MX value.
 */
export function qualityScore(p: { marketValueGbp: number | null; leagueTier: number | null; squadNumber: number | null; valueMp: number | null }) {
  if (p.marketValueGbp) return 1_000_000 + p.marketValueGbp / 1000;
  const league = (6 - Math.min(5, p.leagueTier ?? 5)) * 100;
  const firstTeam = p.squadNumber !== null && p.squadNumber >= 1 && p.squadNumber <= 11 ? 40 : p.squadNumber !== null && p.squadNumber <= 30 ? 15 : 0;
  return league + firstTeam + (p.valueMp ?? 0);
}

/** Price for rank i of n in a range: a few expensive stars, most cards near the bottom. */
export function bandPrice(i: number, n: number, min: number, max: number) {
  const r = n <= 1 ? 0 : i / (n - 1);
  const raw = min + (max - min) * (1 - r) ** 2;
  // Shop-style prices: x.99 from 5 MX up, 0.25 steps below.
  const shop = raw >= 500 ? Math.round(raw / 100) * 100 - 1 : Math.round(raw / 25) * 25;
  return clampPrice(Math.min(max, Math.max(min, shop)));
}

async function listFromPool(tx: Tx, cardId: string, priceMinor: number, expiresAt: Date) {
  await tx.$queryRaw`SELECT id FROM "CardInstance" WHERE id = ${cardId}::uuid FOR UPDATE`;
  const moved = await tx.cardInstance.updateMany({ where: { id: cardId, supplyState: { in: ["AVAILABLE", "RECIRCULATING"] } }, data: { supplyState: "RESERVED" } });
  if (!moved.count) return false;
  await tx.marketListing.create({ data: { cardId, sellerId: null, house: true, askingPriceMinor: priceMinor, currency: "MX", expiresAt } });
  return true;
}

/** Admin: take `count` cards of a tier out of the pack pool and list them at buy-now prices. */
export async function stockHouseListings(adminId: string, input: z.input<typeof HouseStockSchema>) {
  const d = HouseStockSchema.parse(input);
  return withTx(
    async (tx) => {
      const leagueSql = d.leagues?.length ? Prisma.sql`AND l.code = ANY(${d.leagues}::text[])` : Prisma.empty;
      // One copy per player not already on the list, chosen at random from the pool.
      const cards = await tx.$queryRaw<Array<{ id: string; playerId: string; marketValueGbp: number | null; squadNumber: number | null; leagueTier: number | null }>>`
        SELECT DISTINCT ON (t."playerId") c.id, t."playerId", p."marketValueGbp", p."squadNumber", l.tier AS "leagueTier"
        FROM "CardInstance" c JOIN "CardTemplate" t ON t.id = c."templateId" JOIN "Player" p ON p.id = t."playerId"
        LEFT JOIN "Club" cl ON cl.id = p."clubId" LEFT JOIN "League" l ON l.id = cl."leagueId"
        WHERE t.category = ${d.tier}::"CardCategory" AND t.edition = 'STANDARD' AND c."supplyState" IN ('AVAILABLE', 'RECIRCULATING') ${leagueSql}
          AND NOT EXISTS (
            SELECT 1 FROM "MarketListing" ml JOIN "CardInstance" c2 ON c2.id = ml."cardId" JOIN "CardTemplate" t2 ON t2.id = c2."templateId"
            WHERE ml.house AND ml.status = 'ACTIVE' AND t2."playerId" = t."playerId" AND t2.category = t.category)
        ORDER BY t."playerId", random()`;
      const picked = cards.sort(() => Math.random() - 0.5).slice(0, d.count);
      if (!picked.length) throw new DomainError("NO_STOCK", "No unowned cards of that tier are left in circulation.");
      const keys = picked.map((c) => ({ playerId: c.playerId, category: d.tier }));
      const [values, avgs] = await Promise.all([latestValues(keys), averageSalePrices(keys)]);
      const key = (c: { playerId: string }) => `${c.playerId}:${d.tier}`;
      const ranked = [...picked].sort((a, b) => qualityScore({ ...b, valueMp: values.get(key(b)) ?? null }) - qualityScore({ ...a, valueMp: values.get(key(a)) ?? null }));
      const expiresAt = new Date(Date.now() + d.days * 86_400_000);
      let listed = 0;
      for (const [i, c] of ranked.entries()) {
        const priceMinor =
          d.minPriceMinor !== null && d.maxPriceMinor !== null
            ? bandPrice(i, ranked.length, d.minPriceMinor, d.maxPriceMinor)
            : (d.priceMinor ?? clampPrice(recommendPrice(values.get(key(c)) ?? null, avgs.get(key(c))) * (1 + d.markupPct / 100)));
        if (await listFromPool(tx, c.id, priceMinor, expiresAt)) listed++;
      }
      await audit(tx, { actorId: adminId, action: "house.stock", entityType: "MarketListing", after: { ...d, listed } });
      return listed;
    },
    { timeoutMs: 60_000 },
  );
}

/**
 * Admin: list named players at set prices, e.g. "Haaland=45". Uses the player's best tier with a
 * copy left in circulation. Returns what was listed and what couldn't be.
 */
export async function stockPinnedListings(adminId: string, text: string, days = 7) {
  const lines = text.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const listed: string[] = [];
  const missed: string[] = [];
  for (const line of lines) {
    const m = /^(.+?)\s*=\s*£?\s*(\d+(?:\.\d{1,2})?)$/.exec(line);
    if (!m) {
      missed.push(`${line} (use Name=price)`);
      continue;
    }
    const priceMinor = Math.round(Number(m[2]) * 100);
    if (priceMinor < MIN_PRICE_MINOR || priceMinor > MAX_PRICE_MINOR) {
      missed.push(`${m[1]} (price must be 0.10–100)`);
      continue;
    }
    const ok = await withTx(async (tx) => {
      const [card] = await tx.$queryRaw<Array<{ id: string; name: string }>>`
        SELECT c.id, p."displayName" AS name FROM "CardInstance" c JOIN "CardTemplate" t ON t.id = c."templateId" JOIN "Player" p ON p.id = t."playerId"
        WHERE p."displayName" ILIKE ${"%" + m[1] + "%"} AND t.edition = 'STANDARD' AND c."supplyState" IN ('AVAILABLE', 'RECIRCULATING')
        ORDER BY t.category DESC, p."marketValueGbp" DESC NULLS LAST, c.serial LIMIT 1`;
      if (!card) return null;
      return (await listFromPool(tx, card.id, priceMinor, new Date(Date.now() + days * 86_400_000))) ? card.name : null;
    });
    if (ok) listed.push(`${ok} ${(priceMinor / 100).toFixed(2)} MX`);
    else missed.push(`${m[1]} (no copy left in circulation)`);
  }
  await audit(db, { actorId: adminId, action: "house.pinned", entityType: "MarketListing", after: { listed, missed } });
  return { listed, missed };
}

/** Admin: stock the launch mix from src/config/transfers.ts in one go. */
export async function stockLaunchMix(adminId: string) {
  const { LAUNCH_MIX } = await import("@/config/transfers");
  const pinned = await stockPinnedListings(adminId, LAUNCH_MIX.pinned.join(","), LAUNCH_MIX.days);
  let total = pinned.listed.length;
  for (const b of LAUNCH_MIX.bands) {
    total += await stockHouseListings(adminId, {
      tier: b.tier,
      count: b.count,
      minPriceMinor: Math.round(b.minMp * 100),
      maxPriceMinor: Math.round(b.maxMp * 100),
      leagues: [...b.leagues],
      days: LAUNCH_MIX.days,
    }).catch((e) => {
      if (e instanceof DomainError) return 0;
      throw e;
    });
  }
  return { total, missed: pinned.missed };
}

/** Admin: withdraw every active house listing (cards go back into packs). */
export async function clearHouseListings(adminId: string) {
  // Old MATCHX listings from circulation only — player drops are managed on the player database page.
  const active = await db.marketListing.findMany({ where: { house: true, status: "ACTIVE", card: { packable: true } }, select: { id: true } });
  for (const { id } of active) {
    await withTx(async (tx) => {
      const l = await lockListing(tx, id);
      if (l && l.status === "ACTIVE") await closeListing(tx, l, "CANCELLED");
    });
  }
  await audit(db, { actorId: adminId, action: "house.clear", entityType: "MarketListing", after: { cleared: active.length } });
  return active.length;
}
