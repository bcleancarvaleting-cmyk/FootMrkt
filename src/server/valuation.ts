import type { CardCategory, Prisma } from "@/generated/prisma/client";
import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer, toStatLine } from "@/domain/football/scoring";
import { VALUATION_CONFIG, computeMp } from "@/domain/valuation/mp";
import { db } from "./db";

const FORM_GAMEWEEKS = 3;

/** Recompute indicative MP for every player+category with a STANDARD template. */
export async function revalueAll(now = new Date()) {
  const templates = await db.cardTemplate.findMany({
    where: { edition: "STANDARD", active: true },
    include: { player: { include: { club: { include: { league: true } } } } },
  });
  const supply = await db.cardInstance.groupBy({ by: ["templateId"], _count: { _all: true }, where: { supplyState: { not: "RETIRED" } } });
  const supplyBy = new Map(supply.map((s) => [s.templateId, s._count._all]));
  const settledGws = await db.gameweek.findMany({ where: { status: "SETTLED" }, orderBy: [{ season: "desc" }, { number: "desc" }], take: FORM_GAMEWEEKS });
  const stats = await db.playerMatchStat.findMany({
    where: { isCurrent: true, fixture: { gameweekId: { in: settledGws.map((g) => g.id) } } },
    include: { fixture: true },
  });
  const rules = getScoringRules(CURRENT_SCORING_RULES);
  const since = new Date(now.getTime() - 30 * 24 * 3600_000);
  const sales = await db.marketListing.findMany({
    where: { status: "SOLD", soldAt: { gte: since } },
    include: { card: { include: { template: true } } },
  });

  let written = 0;
  for (const t of templates) {
    const perGw = settledGws.map((gw) => {
      const lines = stats.filter((s) => s.playerId === t.playerId && s.fixture.gameweekId === gw.id).map((s) => toStatLine(s.stats));
      return scorePlayer(rules, t.player.position, lines).points;
    });
    const previous = await db.mPValuation.findFirst({
      where: { playerId: t.playerId, category: t.category },
      orderBy: { computedAt: "desc" },
    });
    const r = computeMp({
      category: t.category,
      leagueTier: t.player.club?.league.tier ?? 4,
      issuedSupply: supplyBy.get(t.id) ?? 0,
      recentGameweekPoints: perGw,
      recentSales: sales
        .filter((s) => s.card.template.playerId === t.playerId && s.card.template.category === t.category)
        .map((s) => ({ priceMinor: s.soldPriceMinor ?? 0, buyerId: s.buyerId ?? "", sellerId: s.sellerId ?? "house" })),
      previousMp: previous?.valueMp ?? null,
    });
    // Snapshot every run (even when unchanged) so each card has a complete value history.
    {
      await db.mPValuation.create({
        data: {
          playerId: t.playerId,
          category: t.category,
          valueMp: r.valueMp,
          method: VALUATION_CONFIG.method,
          signals: r.signals as Prisma.InputJsonValue,
          computedAt: now,
        },
      });
      written++;
    }
  }
  return { templates: templates.length, written };
}

/** Latest MP for many player+category pairs. */
export async function latestValues(keys: Array<{ playerId: string; category: CardCategory }>) {
  if (!keys.length) return new Map<string, number>();
  const playerIds = [...new Set(keys.map((k) => k.playerId))];
  const rows = await db.$queryRaw<Array<{ playerId: string; category: CardCategory; valueMp: number }>>`
    SELECT DISTINCT ON ("playerId", category) "playerId", category, "valueMp"
    FROM "MPValuation" WHERE "playerId" = ANY(${playerIds}::uuid[])
    ORDER BY "playerId", category, "computedAt" DESC`;
  return new Map(rows.map((r) => [`${r.playerId}:${r.category}`, r.valueMp]));
}

/** Latest MP plus % change vs the previous valuation, for rising/falling indicators. */
export async function valueTrends(keys: Array<{ playerId: string; category: CardCategory }>) {
  const out = new Map<string, { mp: number; trendPct: number | null }>();
  if (!keys.length) return out;
  const playerIds = [...new Set(keys.map((k) => k.playerId))];
  const rows = await db.$queryRaw<Array<{ playerId: string; category: CardCategory; valueMp: number; rn: bigint }>>`
    SELECT * FROM (
      SELECT "playerId", category, "valueMp",
             ROW_NUMBER() OVER (PARTITION BY "playerId", category ORDER BY "computedAt" DESC) AS rn
      FROM "MPValuation" WHERE "playerId" = ANY(${playerIds}::uuid[])
    ) v WHERE rn <= 2`;
  for (const r of rows.filter((r) => Number(r.rn) === 1)) {
    const prev = rows.find((x) => Number(x.rn) === 2 && x.playerId === r.playerId && x.category === r.category);
    out.set(valueKey(r.playerId, r.category), {
      mp: r.valueMp,
      trendPct: prev && prev.valueMp > 0 ? Math.round(((r.valueMp - prev.valueMp) / prev.valueMp) * 1000) / 10 : null,
    });
  }
  return out;
}

export const valueKey = (playerId: string, category: string) => `${playerId}:${category}`;
