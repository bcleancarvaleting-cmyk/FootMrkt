import type { CardCategory, Prisma } from "@/generated/prisma/client";
import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer, toStatLine } from "@/domain/football/scoring";
import { VALUATION_CONFIG, computeMp } from "@/domain/valuation/mp";
import { db } from "./db";

const FORM_GAMEWEEKS = 3;

/** Recompute indicative MX for every player+category with a STANDARD template. */
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

/** Latest MX for many player+category pairs. */
export async function latestValues(keys: Array<{ playerId: string; category: CardCategory }>) {
  if (!keys.length) return new Map<string, number>();
  const playerIds = [...new Set(keys.map((k) => k.playerId))];
  const rows = await db.$queryRaw<Array<{ playerId: string; category: CardCategory; valueMp: number }>>`
    SELECT DISTINCT ON ("playerId", category) "playerId", category, "valueMp"
    FROM "MPValuation" WHERE "playerId" = ANY(${playerIds}::uuid[])
    ORDER BY "playerId", category, "computedAt" DESC`;
  return new Map(rows.map((r) => [`${r.playerId}:${r.category}`, r.valueMp]));
}

/** Latest MX plus % change vs the previous valuation, for rising/falling indicators. */
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

export interface PriceTip {
  playerId: string;
  category: CardCategory;
  nowMp: number;
  nextMp: number;
  pct: number;
}
const TIP_KEY = "valuation.tips";
export const TIP_MIN_PCT = 5;

/**
 * "Tipped to rise": run the same value formula the nightly revaluation uses, but with the
 * gameweek being played now counted as form (live points) — the value each card is heading for.
 * Cards heading up TIP_MIN_PCT% or more are tipped. Stored, and refreshed every 30 minutes by the
 * scheduled job; it's a projection from real stats and sales, not a promise.
 */
export async function computePriceTips(now = new Date()) {
  const templates = await db.cardTemplate.findMany({ where: { edition: "STANDARD", active: true }, select: { id: true, playerId: true, category: true, player: { select: { position: true, club: { select: { league: { select: { tier: true } } } } } } } });
  const supply = await db.cardInstance.groupBy({ by: ["templateId"], _count: { _all: true }, where: { supplyState: { not: "RETIRED" } } });
  const supplyBy = new Map(supply.map((s) => [s.templateId, s._count._all]));
  const gws = await db.gameweek.findMany({ where: { status: { in: ["PROVISIONAL", "SETTLED"] } }, orderBy: [{ season: "desc" }, { number: "desc" }], take: FORM_GAMEWEEKS });
  const stats = await db.playerMatchStat.findMany({ where: { isCurrent: true, fixture: { gameweekId: { in: gws.map((g) => g.id) } } }, select: { playerId: true, stats: true, fixture: { select: { gameweekId: true } } } });
  const rules = getScoringRules(CURRENT_SCORING_RULES);
  const since = new Date(now.getTime() - 30 * 24 * 3600_000);
  const sales = await db.marketListing.findMany({ where: { status: "SOLD", soldAt: { gte: since } }, select: { soldPriceMinor: true, buyerId: true, sellerId: true, card: { select: { template: { select: { playerId: true, category: true } } } } } });
  const latest = await db.$queryRaw<Array<{ playerId: string; category: CardCategory; valueMp: number }>>`
    SELECT DISTINCT ON ("playerId", category) "playerId", category, "valueMp" FROM "MPValuation" ORDER BY "playerId", category, "computedAt" DESC`;
  const current = new Map(latest.map((v) => [`${v.playerId}:${v.category}`, v.valueMp]));
  const byPlayer = new Map<string, typeof stats>();
  for (const s of stats) byPlayer.set(s.playerId, [...(byPlayer.get(s.playerId) ?? []), s]);
  const tips: PriceTip[] = [];
  for (const t of templates) {
    const nowMp = current.get(`${t.playerId}:${t.category}`);
    if (nowMp == null || nowMp <= 0) continue;
    const mine = byPlayer.get(t.playerId) ?? [];
    const perGw = gws.map((gw) => scorePlayer(rules, t.player.position, mine.filter((s) => s.fixture.gameweekId === gw.id).map((s) => toStatLine(s.stats))).points);
    const r = computeMp({
      category: t.category,
      leagueTier: t.player.club?.league.tier ?? 4,
      issuedSupply: supplyBy.get(t.id) ?? 0,
      recentGameweekPoints: perGw,
      recentSales: sales.filter((s) => s.card.template.playerId === t.playerId && s.card.template.category === t.category).map((s) => ({ priceMinor: s.soldPriceMinor ?? 0, buyerId: s.buyerId ?? "", sellerId: s.sellerId ?? "house" })),
      previousMp: nowMp,
    });
    const pct = Math.round(((r.valueMp - nowMp) / nowMp) * 100);
    if (pct >= TIP_MIN_PCT && r.valueMp - nowMp >= 1) tips.push({ playerId: t.playerId, category: t.category, nowMp, nextMp: r.valueMp, pct });
  }
  tips.sort((a, b) => b.pct - a.pct);
  // Watchers hear about it once a day per player.
  if (tips.length) {
    const { notify } = await import("./notifications");
    const day = now.toISOString().slice(0, 10);
    const watching = await db.watchItem.findMany({ where: { playerId: { in: tips.map((t) => t.playerId) } }, select: { userId: true, playerId: true } });
    const names = new Map((await db.player.findMany({ where: { id: { in: [...new Set(watching.map((w) => w.playerId))] } }, select: { id: true, displayName: true } })).map((p) => [p.id, p.displayName]));
    for (const w of watching) {
      const t = tips.find((x) => x.playerId === w.playerId)!;
      await notify(w.userId, {
        kind: "value",
        title: `📈 ${names.get(w.playerId) ?? "A watched player"} is tipped to rise`,
        body: `In form and in demand: heading from ${t.nowMp} to about ${t.nextMp} MX at the next revaluation. Buy before it moves.`,
        href: `/players/${w.playerId}`,
        dedupeKey: `tip:${w.playerId}:${day}:${w.userId}`,
      });
    }
  }
  await db.appSetting.upsert({ where: { key: TIP_KEY }, create: { key: TIP_KEY, value: { at: now.toISOString(), tips } as never }, update: { value: { at: now.toISOString(), tips } as never } });
  return tips.length;
}

/** Refresh the tips at most every 30 minutes (from the 5-minute job). */
export async function refreshPriceTips(now = new Date()) {
  const row = await db.appSetting.findUnique({ where: { key: TIP_KEY } });
  const at = (row?.value as { at?: string } | null)?.at;
  if (at && now.getTime() - new Date(at).getTime() < 30 * 60_000) return { skipped: "fresh" };
  return { tipped: await computePriceTips(now) };
}

/** The current tips, keyed "playerId:CATEGORY". */
export async function priceTips() {
  const row = await db.appSetting.findUnique({ where: { key: TIP_KEY } }).catch(() => null);
  const tips = ((row?.value as { tips?: PriceTip[] } | null)?.tips ?? []) as PriceTip[];
  return new Map(tips.map((t) => [`${t.playerId}:${t.category}`, t]));
}
