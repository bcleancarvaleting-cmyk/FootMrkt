import type { CardCategory, Position, Prisma } from "@/generated/prisma/client";
import type { CardView } from "@/lib/view";
import { db } from "./db";
import { averageSalePrices, feeFor, recommendPrice } from "./transfers";
import { CARD_INCLUDE, enrichCards } from "./views";

/** Read models for the Transfers pages. */

export interface BoardFilters {
  tier?: CardCategory;
  pos?: Position;
  q?: string;
  sort?: "new" | "price_asc" | "price_desc" | "ending";
}

const key = (playerId: string, category: string) => `${playerId}:${category}`;

/** Value history for many player+tier pairs at once, thinned to at most `max` points each. */
export async function histories(keys: Array<{ playerId: string; category: CardCategory }>, max = 24) {
  const out = new Map<string, number[]>();
  if (!keys.length) return out;
  const rows = await db.mPValuation.findMany({
    where: { playerId: { in: [...new Set(keys.map((k) => k.playerId))] } },
    orderBy: { computedAt: "asc" },
    select: { playerId: true, category: true, valueMp: true },
  });
  for (const r of rows) {
    const k = key(r.playerId, r.category);
    out.set(k, [...(out.get(k) ?? []), r.valueMp]);
  }
  for (const [k, v] of out) {
    if (v.length <= max) continue;
    const step = (v.length - 1) / (max - 1);
    out.set(k, Array.from({ length: max }, (_, i) => v[Math.round(i * step)]));
  }
  return out;
}

export interface ListingRow {
  id: string;
  card: CardView;
  priceMinor: number;
  seller: string;
  sellerId: string | null;
  house: boolean;
  sellerFounding: number | null;
  expiresAt: Date;
  avgMinor: number | null;
  sales: number;
  history: number[];
  bestOfferMinor: number | null;
  offers: number;
  myOffer: { id: string; amountMinor: number } | null;
}

export async function transferBoard(f: BoardFilters, viewerId: string | null, take = 60): Promise<ListingRow[]> {
  const player: Prisma.PlayerWhereInput = {};
  if (f.pos) player.position = f.pos;
  if (f.q) player.OR = [{ displayName: { contains: f.q, mode: "insensitive" } }, { club: { name: { contains: f.q, mode: "insensitive" } } }];
  const orderBy: Prisma.MarketListingOrderByWithRelationInput =
    f.sort === "price_asc" ? { askingPriceMinor: "asc" } : f.sort === "price_desc" ? { askingPriceMinor: "desc" } : f.sort === "ending" ? { expiresAt: "asc" } : { createdAt: "desc" };
  const listings = await db.marketListing.findMany({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() }, card: { template: { category: f.tier, player } } },
    include: {
      card: { include: CARD_INCLUDE },
      seller: { select: { displayName: true, foundingNumber: true } },
      offers: { where: { status: "PENDING" }, select: { id: true, amountMinor: true, buyerId: true } },
    },
    orderBy,
    take,
  });
  return buildRows(listings, viewerId);
}

async function buildRows(
  listings: Array<
    Prisma.MarketListingGetPayload<{ include: { card: { include: typeof CARD_INCLUDE } } }> & {
      seller: { displayName: string; foundingNumber?: number | null } | null;
      offers: Array<{ id: string; amountMinor: number; buyerId: string }>;
    }
  >,
  viewerId: string | null,
): Promise<ListingRow[]> {
  const keys = listings.map((l) => ({ playerId: l.card.template.playerId, category: l.card.template.category }));
  const [views, avgs, hist] = await Promise.all([enrichCards(listings.map((l) => l.card)), averageSalePrices(keys), histories(keys)]);
  return listings.map((l, i) => {
    const k = key(keys[i].playerId, keys[i].category);
    const mine = viewerId ? l.offers.find((o) => o.buyerId === viewerId) : undefined;
    return {
      id: l.id,
      card: views[i],
      priceMinor: l.askingPriceMinor,
      seller: l.seller?.displayName ?? "MATCHX",
      sellerId: l.sellerId,
      house: l.house,
      sellerFounding: l.seller?.foundingNumber ?? null,
      expiresAt: l.expiresAt,
      avgMinor: avgs.get(k)?.avgMinor ?? null,
      sales: avgs.get(k)?.sales ?? 0,
      history: hist.get(k) ?? [],
      bestOfferMinor: l.offers.length ? Math.max(...l.offers.map((o) => o.amountMinor)) : null,
      offers: l.offers.length,
      myOffer: mine ? { id: mine.id, amountMinor: mine.amountMinor } : null,
    };
  });
}

export async function auctionBoard(viewerId: string | null) {
  const auctions = await db.auction.findMany({
    where: { status: { in: ["LIVE", "SCHEDULED"] } },
    include: {
      card: { include: CARD_INCLUDE },
      bids: { orderBy: { amountMinor: "desc" }, take: 1, include: { user: { select: { displayName: true } } } },
      _count: { select: { bids: true } },
    },
    orderBy: { endsAt: "asc" },
  });
  const keys = auctions.map((a) => ({ playerId: a.card.template.playerId, category: a.card.template.category }));
  const [views, hist] = await Promise.all([enrichCards(auctions.map((a) => a.card)), histories(keys)]);
  return auctions.map((a, i) => {
    const top = a.bids[0];
    return {
      id: a.id,
      card: views[i],
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      live: a.startsAt <= new Date(),
      bids: a._count.bids,
      leadingMinor: top?.amountMinor ?? null,
      leader: top?.user.displayName ?? null,
      youLead: !!viewerId && top?.userId === viewerId,
      minNextMinor: top ? top.amountMinor + a.minIncrementMinor : a.startPriceMinor,
      reserveMet: a.reserveMinor === null || (top?.amountMinor ?? 0) >= a.reserveMinor,
      history: hist.get(key(keys[i].playerId, keys[i].category)) ?? [],
    };
  });
}

export async function recentAuctionResults(take = 8) {
  return db.auction.findMany({
    where: { status: "SETTLED" },
    orderBy: { settledAt: "desc" },
    take,
    include: { winner: { select: { displayName: true } }, card: { include: { template: { include: { player: true } } } } },
  });
}

/** Seller's own active listings with offers, the viewer's open offers and leading bids. */
export async function myTransfers(userId: string) {
  const [listings, offers, sold] = await Promise.all([
    db.marketListing.findMany({
      where: { sellerId: userId, status: "ACTIVE" },
      include: {
        card: { include: CARD_INCLUDE },
        seller: { select: { displayName: true } },
        offers: { where: { status: "PENDING" }, orderBy: { amountMinor: "desc" }, select: { id: true, amountMinor: true, buyerId: true, buyer: { select: { displayName: true } }, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.marketOffer.findMany({
      where: { buyerId: userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { listing: { include: { card: { include: { template: { include: { player: true } } } }, seller: { select: { displayName: true } } } } },
    }),
    db.marketListing.findMany({
      where: { OR: [{ sellerId: userId }, { buyerId: userId }], status: "SOLD" },
      orderBy: { soldAt: "desc" },
      take: 20,
      include: { card: { include: { template: { include: { player: true } } } }, seller: { select: { displayName: true } }, buyer: { select: { displayName: true } } },
    }),
  ]);
  const rows = await buildRows(listings, userId);
  return {
    listings: rows.map((r, i) => ({ ...r, offerList: listings[i].offers })),
    offers,
    history: sold.map((s) => ({ ...s, side: s.sellerId === userId ? ("SOLD" as const) : ("BOUGHT" as const), net: s.sellerId === userId ? (s.soldPriceMinor ?? 0) - (s.feeMinor ?? 0) : s.soldPriceMinor ?? 0 })),
  };
}

/** What the "list this card" form shows: recommended price, average sale, and the fee preview. */
export async function listingGuidance(card: CardView) {
  const avg = (await averageSalePrices([{ playerId: card.playerId, category: card.category }])).get(key(card.playerId, card.category));
  const rec = recommendPrice(card.valueMp, avg);
  return { recommendedMinor: rec, avgMinor: avg?.avgMinor ?? null, sales: avg?.sales ?? 0, feeAtRecommendedMinor: feeFor(rec) };
}
