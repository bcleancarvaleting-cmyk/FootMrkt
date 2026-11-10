import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { audit } from "./audit";
import { mintInstances } from "./cards";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { CARD_INCLUDE, enrichCards } from "./views";

/**
 * Player drops (product decision 10 Nov 2026) — replaces auctions. MATCHX releases specific
 * players at a fixed buy-now price, going live at a scheduled time with no end time. Each drop is
 * one brand-new copy (minted for the drop, so packs never draw it) and only one per player can be
 * on sale at a time. Admins schedule a week at once from the player database.
 */
const NO_END = 10 * 365 * 86_400_000;

export const DropItemSchema = z.object({
  playerId: z.string().uuid(),
  priceMinor: z.number().int().min(10, "Minimum price is 0.10 MX").max(10_000, "Maximum price is 100 MX"),
  liveAt: z.coerce.date(),
});

/** Admin player database: supply per player for their current tier. */
export async function playerDatabase(f: { q?: string; league?: string; tier?: string; sort?: string; take?: number }) {
  const where = Prisma.sql`
    WHERE t.active AND t.edition = 'STANDARD' AND p.active
    ${f.q ? Prisma.sql`AND (p."displayName" ILIKE ${"%" + f.q + "%"} OR c.name ILIKE ${"%" + f.q + "%"})` : Prisma.empty}
    ${f.league ? Prisma.sql`AND l.code = ${f.league}` : Prisma.empty}
    ${f.tier ? Prisma.sql`AND t.category = ${f.tier}::"CardCategory"` : Prisma.empty}`;
  const order =
    f.sort === "pct_desc" ? Prisma.sql`pct DESC NULLS LAST` : f.sort === "pct_asc" ? Prisma.sql`pct ASC NULLS FIRST` : f.sort === "name" ? Prisma.sql`p."displayName" ASC` : Prisma.sql`p."marketValueGbp" DESC NULLS LAST`;
  return db.$queryRaw<
    Array<{ playerId: string; name: string; club: string | null; league: string | null; tier: string; position: string; valueGbp: number | null; maxSupply: number | null; issued: number; held: number; inPacks: number; pct: number | null; onDrop: boolean }>
  >`
    SELECT p.id AS "playerId", p."displayName" AS name, c.name AS club, l.code AS league, t.category::text AS tier, p.position::text AS position,
           p."marketValueGbp" AS "valueGbp", t."maxSupply",
           COUNT(ci.id) FILTER (WHERE ci."supplyState" <> 'RETIRED')::int AS issued,
           COUNT(ci.id) FILTER (WHERE ci."supplyState" = 'HELD')::int AS held,
           COUNT(ci.id) FILTER (WHERE ci."supplyState" IN ('AVAILABLE', 'RECIRCULATING') AND ci.packable)::int AS "inPacks",
           CASE WHEN t."maxSupply" > 0 THEN ROUND(100.0 * COUNT(ci.id) FILTER (WHERE ci."supplyState" = 'HELD') / t."maxSupply", 1)::float END AS pct,
           EXISTS (SELECT 1 FROM "MarketListing" ml JOIN "CardInstance" c2 ON c2.id = ml."cardId" JOIN "CardTemplate" t2 ON t2.id = c2."templateId"
                   WHERE ml.house AND ml.status = 'ACTIVE' AND NOT c2.packable AND t2."playerId" = p.id) AS "onDrop"
    FROM "CardTemplate" t JOIN "Player" p ON p.id = t."playerId"
    LEFT JOIN "Club" c ON c.id = p."clubId" LEFT JOIN "League" l ON l.id = c."leagueId"
    LEFT JOIN "CardInstance" ci ON ci."templateId" = t.id
    ${where}
    GROUP BY p.id, c.name, l.code, t.category, t."maxSupply"
    ORDER BY ${order}
    LIMIT ${f.take ?? 100}`;
}

/** Schedule drops: one new copy per player, live at the given time, buy-now price, no end time. */
export async function scheduleDrops(adminId: string, items: Array<z.input<typeof DropItemSchema>>) {
  const parsed = z.array(DropItemSchema).min(1).max(200).parse(items);
  const created: string[] = [];
  const skipped: string[] = [];
  for (const it of parsed) {
    const res = await withTx(async (tx) => {
      const tpl = await tx.cardTemplate.findFirst({ where: { playerId: it.playerId, active: true, edition: "STANDARD" }, include: { player: { select: { displayName: true } } } });
      if (!tpl) return { skip: "no active card" };
      const open = await tx.marketListing.count({ where: { house: true, status: "ACTIVE", card: { packable: false, template: { playerId: it.playerId } } } });
      if (open) return { skip: `${tpl.player.displayName}: already on a drop` };
      const [cardId] = await mintInstances(tx, { templateId: tpl.id, count: 1, state: "AVAILABLE" });
      if (!cardId) return { skip: `${tpl.player.displayName}: all ${tpl.maxSupply} copies already exist` };
      await tx.cardInstance.update({ where: { id: cardId }, data: { supplyState: "RESERVED", packable: false } });
      const l = await tx.marketListing.create({
        data: { cardId, sellerId: null, house: true, askingPriceMinor: it.priceMinor, currency: "MX", liveAt: it.liveAt, expiresAt: new Date(it.liveAt.getTime() + NO_END) },
      });
      await audit(tx, { actorId: adminId, action: "drop.player", entityType: "MarketListing", entityId: l.id, after: { playerId: it.playerId, priceMinor: it.priceMinor, liveAt: it.liveAt } });
      return { ok: tpl.player.displayName };
    });
    if ("ok" in res) created.push(res.ok!);
    else skipped.push(res.skip!);
  }
  return { created, skipped };
}

/** Live drops (buyable now) and the upcoming schedule (teaser). */
export async function dropBoard(now = new Date()) {
  const rows = await db.marketListing.findMany({
    where: { house: true, status: "ACTIVE", card: { packable: false } },
    include: { card: { include: CARD_INCLUDE } },
    orderBy: [{ liveAt: "asc" }],
    take: 200,
  });
  const views = await enrichCards(rows.map((r) => r.card));
  const all = rows.map((r, i) => ({ id: r.id, card: views[i], priceMinor: r.askingPriceMinor, liveAt: r.liveAt ?? r.createdAt }));
  return {
    live: all.filter((d) => d.liveAt <= now).sort((a, b) => b.liveAt.getTime() - a.liveAt.getTime()),
    upcoming: all.filter((d) => d.liveAt > now),
  };
}

export async function upcomingDropsAdmin() {
  return db.marketListing.findMany({
    where: { house: true, status: "ACTIVE", card: { packable: false } },
    include: { card: { include: { template: { include: { player: { include: { club: true } } } } } } },
    orderBy: { liveAt: "asc" },
    take: 300,
  });
}

/** Admin: withdraw a drop before anyone buys it (the minted copy is retired). */
export async function cancelPlayerDrop(adminId: string, listingId: string) {
  return withTx(async (tx) => {
    const l = await tx.marketListing.findUnique({ where: { id: listingId }, include: { card: true } });
    if (!l || l.status !== "ACTIVE" || l.card.packable) throw new DomainError("NOT_FOUND", "Drop not found or already sold.");
    await tx.marketListing.update({ where: { id: listingId }, data: { status: "CANCELLED" } });
    await tx.cardInstance.update({ where: { id: l.cardId }, data: { supplyState: "RETIRED" } });
    await audit(tx, { actorId: adminId, action: "drop.cancel", entityType: "MarketListing", entityId: listingId });
  });
}
