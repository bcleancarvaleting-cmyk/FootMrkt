import type { CardCategory, Prisma } from "@/generated/prisma/client";
import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer, toStatLine } from "@/domain/football/scoring";
import { VALUE_V2, computeValueV2, percentiles } from "@/domain/valuation/v2";
import { db } from "./db";

/**
 * Value v2 for every player's current card (see src/domain/valuation/v2.ts), from this season's
 * form, real-world market value, demand and sales. `includeLive` counts the gameweek being played
 * (for "Tipped to rise"); `reset` skips the per-run cap (launch pricing).
 */
async function valuePlayers(now: Date, opts: { includeLive?: boolean; reset?: boolean } = {}) {
  const templates = await db.cardTemplate.findMany({
    where: { edition: "STANDARD", active: true },
    select: { id: true, playerId: true, category: true, player: { select: { position: true, marketValueGbp: true } } },
  });
  const latestGw = await db.gameweek.findFirst({ where: { status: { in: ["PROVISIONAL", "SETTLED"] } }, orderBy: [{ season: "desc" }, { number: "desc" }], select: { season: true } });
  const gws = latestGw
    ? await db.gameweek.findMany({ where: { season: latestGw.season, status: { in: opts.includeLive ? ["PROVISIONAL", "SETTLED"] : ["SETTLED"] } }, select: { id: true } })
    : [];
  const stats = gws.length
    ? await db.playerMatchStat.findMany({ where: { isCurrent: true, fixture: { gameweekId: { in: gws.map((g) => g.id) } } }, select: { playerId: true, stats: true } })
    : [];
  const rules = getScoringRules(CURRENT_SCORING_RULES);
  const position = new Map(templates.map((t) => [t.playerId, t.player.position]));
  const form = new Map<string, { pts: number; apps: number }>();
  for (const s of stats) {
    const line = toStatLine(s.stats);
    if (line.minutes <= 0) continue;
    const f = form.get(s.playerId) ?? { pts: 0, apps: 0 };
    f.pts += scorePlayer(rules, position.get(s.playerId) ?? "MID", [line]).points;
    f.apps += 1;
    form.set(s.playerId, f);
  }
  // Form ranks within each position (at least 2 appearances to count).
  const formPct = new Map<string, number | null>();
  for (const pos of ["GK", "DEF", "MID", "ATT"]) {
    const ids = [...new Set(templates.filter((t) => t.player.position === pos).map((t) => t.playerId))];
    const r = percentiles(ids.map((id) => [id, (form.get(id)?.apps ?? 0) >= 2 ? form.get(id)!.pts / form.get(id)!.apps : null] as [string, number | null]));
    for (const [k, v] of r) formPct.set(k, v);
  }
  const mvPct = percentiles([...new Map(templates.map((t) => [t.playerId, t.player.marketValueGbp ?? null])).entries()]);

  // Demand over the last 7 days: watchers, MATCHX buy-now sales, offers, sales between managers.
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const [watchers, sold, offers] = await Promise.all([
    db.watchItem.groupBy({ by: ["playerId"], _count: { _all: true } }),
    db.marketListing.findMany({ where: { status: "SOLD", soldAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, select: { house: true, soldAt: true, soldPriceMinor: true, buyerId: true, sellerId: true, card: { select: { template: { select: { playerId: true, category: true } } } } } }),
    db.marketOffer.findMany({ where: { createdAt: { gte: week } }, select: { listing: { select: { card: { select: { template: { select: { playerId: true } } } } } } } }),
  ]);
  const demand = new Map<string, number>();
  const bump = (id: string, n: number) => demand.set(id, (demand.get(id) ?? 0) + n);
  for (const w of watchers) bump(w.playerId, w._count._all);
  for (const s of sold) if (s.soldAt && s.soldAt >= week) bump(s.card.template.playerId, s.house ? 3 : 2);
  for (const o of offers) bump(o.listing.card.template.playerId, 2);
  const nonZero = percentiles([...demand.entries()].filter(([, v]) => v > 0));
  const demandPct = (id: string) => ((demand.get(id) ?? 0) > 0 ? 0.4 + 0.6 * (nonZero.get(id) ?? 0) : 0);

  const latest = await db.$queryRaw<Array<{ playerId: string; category: CardCategory; valueMp: number }>>`
    SELECT DISTINCT ON ("playerId", category) "playerId", category, "valueMp" FROM "MPValuation" ORDER BY "playerId", category, "computedAt" DESC`;
  const previous = new Map(latest.map((v) => [`${v.playerId}:${v.category}`, Number(v.valueMp)]));

  return templates.map((t) => {
    const prev = previous.get(`${t.playerId}:${t.category}`) ?? null;
    const r = computeValueV2({
      formPct: formPct.get(t.playerId) ?? null,
      marketValuePct: mvPct.get(t.playerId) ?? null,
      demandPct: demandPct(t.playerId),
      recentSales: sold
        .filter((s) => !s.house && s.card.template.playerId === t.playerId && s.card.template.category === t.category)
        .map((s) => ({ priceMinor: s.soldPriceMinor ?? 0, buyerId: s.buyerId ?? "", sellerId: s.sellerId ?? "house" })),
      previousPounds: opts.reset ? null : prev,
    });
    return { playerId: t.playerId, category: t.category, pounds: r.pounds, previous: prev, signals: r.signals };
  });
}

/** Revalue every player's card (after each gameweek; `reset` for launch pricing). */
export async function revalueAll(now = new Date(), opts: { reset?: boolean } = {}) {
  const rows = await valuePlayers(now, { reset: opts.reset });
  // Snapshot every run (even when unchanged) so each card has a complete value history.
  for (let i = 0; i < rows.length; i += 1000) {
    await db.mPValuation.createMany({
      data: rows.slice(i, i + 1000).map((r) => ({ playerId: r.playerId, category: r.category, valueMp: r.pounds, method: VALUE_V2.method, signals: r.signals as Prisma.InputJsonValue, computedAt: now })),
    });
  }
  return { templates: rows.length, written: rows.length };
}

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
  const rows = await valuePlayers(now, { includeLive: true });
  const tips: PriceTip[] = rows
    .filter((r) => r.previous != null && r.previous > 0)
    .map((r) => ({ playerId: r.playerId, category: r.category, nowMp: r.previous!, nextMp: r.pounds, pct: Math.round(((r.pounds - r.previous!) / r.previous!) * 100) }))
    .filter((t) => t.pct >= TIP_MIN_PCT && t.nextMp - t.nowMp >= 0.1);
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
        body: `In form and in demand: heading from £${t.nowMp.toFixed(2)} to about £${t.nextMp.toFixed(2)} at the next revaluation. Buy before it moves.`,
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
