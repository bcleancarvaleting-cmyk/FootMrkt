import { bundleForShortfall } from "@/config/bundles";
import { db } from "./db";
import { DomainError } from "./errors";
import { requireFlag } from "./flags";
import { buyNow } from "./transfers";
import { CARD_INCLUDE, enrichCards } from "./views";
import { balancesFor, fmtMp } from "./wallet";

/**
 * Basket for MATCHX player drops (product decision 11 Nov 2026): "Add to transfers" collects
 * players, then "Pay for all" signs them in one go. If there isn't enough MX, the checkout says
 * how much is short and which bundle covers it. Items aren't reserved — whoever pays first signs
 * the player — so sold-out items are dropped from the basket automatically. Each player is bought
 * through the normal buy-now path, so every purchase is locked, idempotent and audited as before.
 */
const MAX_ITEMS = 25;

export async function addToBasket(userId: string, listingId: string) {
  await requireFlag("MARKET");
  const l = await db.marketListing.findUnique({ where: { id: listingId }, select: { house: true, status: true, liveAt: true, card: { select: { packable: true } } } });
  if (!l || !l.house || l.status !== "ACTIVE") throw new DomainError("NOT_AVAILABLE", "This player is no longer available.");
  if (l.liveAt && l.liveAt > new Date()) throw new DomainError("NOT_LIVE", "This drop isn't on sale yet.");
  if ((await db.basketItem.count({ where: { userId } })) >= MAX_ITEMS) throw new DomainError("BASKET_FULL", `Your basket holds up to ${MAX_ITEMS} players — pay for these first.`);
  await db.basketItem.createMany({ data: [{ userId, listingId }], skipDuplicates: true });
}

export async function removeFromBasket(userId: string, listingId: string) {
  await db.basketItem.deleteMany({ where: { userId, listingId } });
}

export async function basketIds(userId: string) {
  return new Set((await db.basketItem.findMany({ where: { userId }, select: { listingId: true } })).map((b) => b.listingId));
}

export async function basketCount(userId: string) {
  return db.basketItem.count({ where: { userId } });
}

/** What's in the basket. Players someone else has signed meanwhile are removed (and reported). */
export async function basketView(userId: string) {
  const items = await db.basketItem.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const listings = await db.marketListing.findMany({ where: { id: { in: items.map((i) => i.listingId) } }, include: { card: { include: CARD_INCLUDE } } });
  const byId = new Map(listings.map((l) => [l.id, l]));
  const live = items.map((i) => byId.get(i.listingId)).filter((l): l is NonNullable<typeof l> => !!l && l.status === "ACTIVE" && l.expiresAt > new Date());
  const gone = items.filter((i) => !live.some((l) => l.id === i.listingId));
  if (gone.length) await db.basketItem.deleteMany({ where: { userId, listingId: { in: gone.map((g) => g.listingId) } } });
  const views = await enrichCards(live.map((l) => l.card));
  const rows = live.map((l, i) => ({ listingId: l.id, card: views[i], priceMinor: l.askingPriceMinor }));
  const totalMinor = rows.reduce((s, r) => s + r.priceMinor, 0);
  const bal = await balancesFor(userId);
  const shortMinor = Math.max(0, totalMinor - bal.total);
  return { rows, totalMinor, balanceMinor: bal.total, shortMinor, removed: gone.length, bundle: shortMinor ? bundleForShortfall(shortMinor) : null };
}

/**
 * Pay for everything in the basket with MX. Checks the total first, so it either signs every
 * player still available or (when MX is short) nothing at all. Returns who was signed and who
 * had already gone.
 */
export async function checkoutBasket(userId: string) {
  await requireFlag("MARKET");
  const v = await basketView(userId);
  if (!v.rows.length) throw new DomainError("EMPTY", v.removed ? "Those players have already been signed by someone else." : "Your basket is empty.");
  if (v.shortMinor > 0) {
    throw new DomainError("NEED_MX", `You need ${fmtMp(v.shortMinor)} more MX to pay for these players (total ${fmtMp(v.totalMinor)}, you have ${fmtMp(v.balanceMinor)}).`, { shortMinor: v.shortMinor });
  }
  const signed: string[] = [];
  const missed: string[] = [];
  const done: string[] = [];
  for (const r of v.rows) {
    try {
      await buyNow(userId, r.listingId);
      signed.push(r.card.name);
      done.push(r.listingId);
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
      if (e.code === "INSUFFICIENT_FUNDS") break; // balance changed mid-checkout: stop, keep the rest in the basket
      if (!["NOT_AVAILABLE", "NOT_LIVE", "OWN_LISTING"].includes(e.code)) throw e;
      missed.push(r.card.name);
      done.push(r.listingId);
    }
  }
  await db.basketItem.deleteMany({ where: { userId, listingId: { in: done } } });
  return { signed, missed };
}
