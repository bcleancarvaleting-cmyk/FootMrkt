import type { CardCategory } from "@/generated/prisma/client";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { createAuction } from "./transfers";

/**
 * Demand we can supply: players managers are watching that nobody is selling right now — not on
 * the MATCHX market, as a drop, on the Transfer list or at auction. Shown on the admin dashboard
 * (most-watched first) with one-tap ways to put a copy on sale from the unowned pool. Watchers are
 * told automatically the moment it lands (the watchlist market job).
 */
const TIERS: CardCategory[] = ["GOLD", "SILVER", "BRONZE"];

export interface WatchedGap {
  playerId: string;
  name: string;
  club: string | null;
  watchers: number;
  tiers: Array<{ category: CardCategory; stock: number; valueMinor: number | null }>;
}

export async function watchedNotForSale(limit = 15): Promise<{ total: number; rows: WatchedGap[] }> {
  const rows = await db.$queryRaw<Array<{ playerId: string; watchers: number }>>`
    SELECT w."playerId", COUNT(*)::int AS watchers
    FROM "WatchItem" w
    WHERE NOT EXISTS (
        SELECT 1 FROM "MarketListing" ml JOIN "CardInstance" c ON c.id = ml."cardId" JOIN "CardTemplate" t ON t.id = c."templateId"
        WHERE t."playerId" = w."playerId" AND ml.status = 'ACTIVE' AND ml."expiresAt" > now())
      AND NOT EXISTS (
        SELECT 1 FROM "Auction" a JOIN "CardInstance" c ON c.id = a."cardId" JOIN "CardTemplate" t ON t.id = c."templateId"
        WHERE t."playerId" = w."playerId" AND a.status IN ('LIVE', 'SCHEDULED'))
    GROUP BY w."playerId"
    ORDER BY watchers DESC`;
  const top = rows.slice(0, limit);
  if (!top.length) return { total: rows.length, rows: [] };
  const ids = top.map((r) => r.playerId);
  const [players, stock, values] = await Promise.all([
    db.player.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, club: { select: { name: true } } } }),
    db.$queryRaw<Array<{ playerId: string; category: CardCategory; n: number }>>`
      SELECT t."playerId", t.category, COUNT(*)::int AS n FROM "CardInstance" c JOIN "CardTemplate" t ON t.id = c."templateId"
      WHERE t."playerId" = ANY(${ids}::uuid[]) AND t.edition = 'STANDARD' AND c."supplyState" IN ('AVAILABLE', 'RECIRCULATING')
        AND NOT EXISTS (SELECT 1 FROM "CardFinish" f WHERE f."cardId" = c.id)
      GROUP BY t."playerId", t.category`,
    db.$queryRaw<Array<{ playerId: string; category: CardCategory; valueMp: number }>>`
      SELECT DISTINCT ON ("playerId", category) "playerId", category, "valueMp" FROM "MPValuation"
      WHERE "playerId" = ANY(${ids}::uuid[]) ORDER BY "playerId", category, "computedAt" DESC`,
  ]);
  return {
    total: rows.length,
    rows: top.map((r) => {
      const p = players.find((x) => x.id === r.playerId);
      return {
        playerId: r.playerId,
        name: p?.displayName ?? "Unknown",
        club: p?.club?.name ?? null,
        watchers: r.watchers,
        tiers: TIERS.map((category) => {
          const v = values.find((x) => x.playerId === r.playerId && x.category === category);
          return { category, stock: stock.find((x) => x.playerId === r.playerId && x.category === category)?.n ?? 0, valueMinor: v ? Math.round(Number(v.valueMp) * 100) : null };
        }),
      };
    }),
  };
}

/** Put one unowned copy on sale: on the MATCHX market at its value (14 days), or a 24-hour auction from half its value. */
export async function supplyWatchedPlayer(adminId: string, playerId: string, category: CardCategory, mode: "market" | "auction") {
  const [v] = await db.$queryRaw<Array<{ valueMp: number }>>`
    SELECT "valueMp" FROM "MPValuation" WHERE "playerId" = ${playerId}::uuid AND category = ${category}::"CardCategory" ORDER BY "computedAt" DESC LIMIT 1`;
  const valueMinor = Math.max(50, Math.min(2000, Math.round(Number(v?.valueMp ?? 1) * 100)));
  if (mode === "auction") {
    return createAuction(adminId, { playerId, category, startPriceMinor: Math.max(10, Math.round(valueMinor / 2)), minIncrementMinor: 10, startsAt: new Date(), hours: 24 });
  }
  return withTx(async (tx) => {
    const [card] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT c.id FROM "CardInstance" c JOIN "CardTemplate" t ON t.id = c."templateId"
      WHERE t."playerId" = ${playerId}::uuid AND t.category = ${category}::"CardCategory" AND t.edition = 'STANDARD'
        AND c."supplyState" IN ('AVAILABLE', 'RECIRCULATING') AND NOT EXISTS (SELECT 1 FROM "CardFinish" f WHERE f."cardId" = c.id)
      ORDER BY c.serial LIMIT 1 FOR UPDATE OF c SKIP LOCKED`;
    if (!card) throw new DomainError("NO_STOCK", "No unowned copy of this card is left in the pool.");
    await tx.cardInstance.update({ where: { id: card.id }, data: { supplyState: "RESERVED", packable: true } });
    const l = await tx.marketListing.create({ data: { cardId: card.id, sellerId: null, house: true, askingPriceMinor: valueMinor, currency: "MX", expiresAt: new Date(Date.now() + 14 * 86_400_000) } });
    await audit(tx, { actorId: adminId, action: "market.supply-watched", entityType: "MarketListing", entityId: l.id, after: { playerId, category, price: valueMinor } });
    return l;
  });
}
