import type { CardCategory } from "@/generated/prisma/client";
import { toKit } from "@/lib/kit";
import { db } from "./db";

/**
 * Market movers (Transfers → Market movers): the week's biggest risers and fallers in value, the
 * most traded players, and the record sales — the "stock market" view of the game.
 */
export async function marketMovers(now = new Date()) {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const changes = await db.$queryRaw<Array<{ playerId: string; category: CardCategory; now: number; then: number }>>`
    WITH cur AS (
      SELECT DISTINCT ON (t."playerId") t."playerId", t.category FROM "CardTemplate" t
      WHERE t.active AND t.edition = 'STANDARD' ORDER BY t."playerId", t."createdAt" DESC
    ), latest AS (
      SELECT DISTINCT ON (v."playerId", v.category) v."playerId", v.category, v."valueMp" FROM "MPValuation" v
      ORDER BY v."playerId", v.category, v."computedAt" DESC
    ), past AS (
      SELECT DISTINCT ON (v."playerId", v.category) v."playerId", v.category, v."valueMp" FROM "MPValuation" v
      WHERE v."computedAt" >= ${since} ORDER BY v."playerId", v.category, v."computedAt" ASC
    )
    SELECT l."playerId", l.category, l."valueMp" AS now, p."valueMp" AS then
    FROM latest l JOIN past p ON p."playerId" = l."playerId" AND p.category = l.category
    JOIN cur c ON c."playerId" = l."playerId" AND c.category = l.category
    WHERE p."valueMp" > 0 AND l."valueMp" <> p."valueMp"`;
  const withPct = changes.map((c) => ({ ...c, pct: Math.round(((c.now - c.then) / c.then) * 1000) / 10 }));
  const risers = [...withPct].filter((c) => c.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 10);
  const fallers = [...withPct].filter((c) => c.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 10);

  const traded = await db.$queryRaw<Array<{ playerId: string; sales: bigint; avg: number; top: number }>>`
    SELECT t."playerId", COUNT(*) AS sales, AVG(ml."soldPriceMinor")::float AS avg, MAX(ml."soldPriceMinor") AS top
    FROM "MarketListing" ml JOIN "CardInstance" ci ON ci.id = ml."cardId" JOIN "CardTemplate" t ON t.id = ci."templateId"
    WHERE ml.status = 'SOLD' AND ml."soldAt" >= ${since}
    GROUP BY t."playerId" ORDER BY sales DESC, top DESC LIMIT 10`;

  const records = await db.$queryRaw<Array<{ playerId: string; category: CardCategory; price: number; soldAt: Date; finish: string | null; serial: number }>>`
    SELECT t."playerId", t.category, ml."soldPriceMinor" AS price, ml."soldAt", f.kind::text AS finish, ci.serial
    FROM "MarketListing" ml JOIN "CardInstance" ci ON ci.id = ml."cardId" JOIN "CardTemplate" t ON t.id = ci."templateId"
    LEFT JOIN "CardFinish" f ON f."cardId" = ci.id
    WHERE ml.status = 'SOLD' AND ml."soldPriceMinor" IS NOT NULL
    ORDER BY ml."soldPriceMinor" DESC LIMIT 10`;

  const ids = [...new Set([...risers, ...fallers].map((r) => r.playerId).concat(traded.map((t) => t.playerId), records.map((r) => r.playerId)))];
  const players = new Map(
    (await db.player.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, position: true, squadNumber: true, club: { select: { name: true, shortName: true, kit: true, primaryColour: true, secondaryColour: true } } } })).map((p) => [
      p.id,
      { name: p.displayName, position: p.position, squadNumber: p.squadNumber, club: p.club?.name ?? "Free agent", kit: toKit(p.club?.kit, p.club?.primaryColour ?? "#444", p.club?.secondaryColour ?? "#fff") },
    ]),
  );
  const who = (id: string) => players.get(id) ?? { name: "Unknown", position: "MID", squadNumber: null, club: "—", kit: toKit(null, "#444", "#fff") };
  return {
    risers: risers.map((r) => ({ ...r, player: who(r.playerId) })),
    fallers: fallers.map((r) => ({ ...r, player: who(r.playerId) })),
    traded: traded.map((t) => ({ playerId: t.playerId, sales: Number(t.sales), avgMinor: Math.round(t.avg), topMinor: t.top, player: who(t.playerId) })),
    records: records.map((r) => ({ ...r, player: who(r.playerId) })),
  };
}
