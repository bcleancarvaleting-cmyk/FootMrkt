import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { CARD_INCLUDE, enrichCards } from "./views";

/**
 * The MATCHX market: one row per player with copies on sale from MATCHX (cheapest copy first),
 * how many are left, filtered and sorted. Paged, because every player in the game can be on it.
 */
export const MARKET_PAGE = 40;
export type MarketSort = "value" | "cheap" | "left";

export async function marketBoard(f: { q?: string; tier?: "BRONZE" | "SILVER" | "GOLD"; pos?: "GK" | "DEF" | "MID" | "ATT"; league?: string; sort?: MarketSort; page?: number }) {
  const page = Math.max(1, Math.min(500, f.page ?? 1));
  const where: Prisma.Sql[] = [Prisma.sql`ml.house AND ml.status = 'ACTIVE' AND c.packable AND ml."expiresAt" > now() AND (ml."liveAt" IS NULL OR ml."liveAt" <= now())`];
  if (f.tier) where.push(Prisma.sql`t.category = ${f.tier}::"CardCategory"`);
  if (f.pos) where.push(Prisma.sql`p.position = ${f.pos}::"Position"`);
  if (f.league) where.push(Prisma.sql`l.code = ${f.league}`);
  if (f.q) where.push(Prisma.sql`(p."displayName" ILIKE ${"%" + f.q + "%"} OR cl.name ILIKE ${"%" + f.q + "%"})`);
  const cond = Prisma.join(where, " AND ");
  const order = f.sort === "cheap" ? Prisma.sql`price ASC, p."displayName"` : f.sort === "left" ? Prisma.sql`copies ASC, price DESC` : Prisma.sql`price DESC, p."displayName"`;
  const base = Prisma.sql`
    FROM "MarketListing" ml JOIN "CardInstance" c ON c.id = ml."cardId" JOIN "CardTemplate" t ON t.id = c."templateId"
    JOIN "Player" p ON p.id = t."playerId" LEFT JOIN "Club" cl ON cl.id = p."clubId" LEFT JOIN "League" l ON l.id = cl."leagueId"
    WHERE ${cond}`;
  const [rows, total] = await Promise.all([
    db.$queryRaw<Array<{ templateId: string; price: number; copies: number; listingId: string; cardId: string }>>`
      SELECT t.id AS "templateId", MIN(ml."askingPriceMinor")::int AS price, COUNT(*)::int AS copies,
             (ARRAY_AGG(ml.id ORDER BY ml."askingPriceMinor", ml."createdAt"))[1] AS "listingId",
             (ARRAY_AGG(ml."cardId" ORDER BY ml."askingPriceMinor", ml."createdAt"))[1] AS "cardId"
      ${base}
      GROUP BY t.id, p."displayName" ORDER BY ${order} LIMIT ${MARKET_PAGE} OFFSET ${(page - 1) * MARKET_PAGE}`,
    db.$queryRaw<Array<{ n: number }>>`SELECT COUNT(DISTINCT t.id)::int AS n ${base}`,
  ]);
  const cards = await db.cardInstance.findMany({ where: { id: { in: rows.map((r) => r.cardId) } }, include: CARD_INCLUDE });
  const views = await enrichCards(rows.map((r) => cards.find((c) => c.id === r.cardId)!).filter(Boolean));
  return {
    page,
    pages: Math.max(1, Math.ceil((total[0]?.n ?? 0) / MARKET_PAGE)),
    total: total[0]?.n ?? 0,
    rows: rows.flatMap((r) => {
      const card = views.find((v) => v.id === r.cardId);
      return card ? [{ listingId: r.listingId, priceMinor: r.price, copies: r.copies, card }] : [];
    }),
  };
}
