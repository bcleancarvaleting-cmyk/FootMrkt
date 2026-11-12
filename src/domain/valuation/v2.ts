/**
 * Player value v2 (product decision 12 Nov 2026): every player is priced in £ (pence precision)
 * from £0.50 to £20, from what actually makes a player wanted:
 *  - Form: MATCHX points per appearance this season, ranked against players in the same position.
 *  - Real-world market value, ranked across all players.
 *  - Demand: managers watching, MATCHX buy-now sales and offers in the last 7 days.
 *  - Sales between managers, once there are enough independent ones.
 * Form and market value set the player's place on the price curve (a few stars near £20, most
 * players £1–£4). Demand adds up to 25% on top. Real sales then pull 20% of the way to what
 * managers are actually paying. Moves are capped per run so nobody can yank a price around.
 * Indicative only: credit is spend-only and a value is never a promise of resale.
 */
import { eligibleSales, type Sale } from "./mp";

export const VALUE_V2 = {
  method: "value-v2",
  minPounds: 0.5,
  maxPounds: 20,
  /** Price curve exponent: higher = fewer expensive players. */
  curve: 3,
  formWeight: 0.6,
  marketValueWeight: 0.4,
  /** With neither form nor market value: low on the curve. */
  unknownComposite: 0.2,
  demandBoost: 0.25,
  minSalesForMarketSignal: 3,
  salesWeight: 0.2,
  /** Max move per run, as a fraction of the previous value (launch pricing skips it). */
  maxChangePerRun: 0.1,
} as const;

export interface ValueInputV2 {
  /** 0–1 rank of points per appearance among the same position this season (null: not enough games). */
  formPct: number | null;
  /** 0–1 rank of real-world market value (null: unknown). */
  marketValuePct: number | null;
  /** 0–1 demand rank (0 when nobody is watching or buying). */
  demandPct: number;
  recentSales: Sale[];
  /** Previous value in £, for damping (null or reset: no damping). */
  previousPounds: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Where a composite rank (0–1) sits on the price curve. */
export function curvePrice(c: number, cfg = VALUE_V2) {
  return cfg.minPounds + (cfg.maxPounds - cfg.minPounds) * Math.pow(clamp(c, 0, 1), cfg.curve);
}

export function computeValueV2(input: ValueInputV2, cfg = VALUE_V2) {
  const parts: Array<[number, number]> = [];
  if (input.formPct != null) parts.push([input.formPct, cfg.formWeight]);
  if (input.marketValuePct != null) parts.push([input.marketValuePct, cfg.marketValueWeight]);
  const weight = parts.reduce((s, [, w]) => s + w, 0);
  const composite = weight ? parts.reduce((s, [v, w]) => s + v * w, 0) / weight : cfg.unknownComposite;
  const model = curvePrice(composite, cfg) * (1 + cfg.demandBoost * clamp(input.demandPct, 0, 1));
  const sales = eligibleSales(input.recentSales);
  const marketPounds = sales.length >= cfg.minSalesForMarketSignal ? median(sales.map((s) => s.priceMinor)) / 100 : null;
  let value = marketPounds === null ? model : (1 - cfg.salesWeight) * model + cfg.salesWeight * marketPounds;
  let damped = false;
  if (input.previousPounds != null && input.previousPounds > 0) {
    const lo = input.previousPounds * (1 - cfg.maxChangePerRun);
    const hi = input.previousPounds * (1 + cfg.maxChangePerRun);
    if (value < lo || value > hi) {
      value = clamp(value, lo, hi);
      damped = true;
    }
  }
  const pounds = round2(clamp(value, cfg.minPounds, cfg.maxPounds));
  return {
    pounds,
    signals: {
      method: cfg.method,
      formPct: input.formPct == null ? null : round2(input.formPct),
      marketValuePct: input.marketValuePct == null ? null : round2(input.marketValuePct),
      demandPct: round2(input.demandPct),
      composite: round2(composite),
      model: round2(model),
      salesConsidered: sales.length,
      marketPounds: marketPounds == null ? null : round2(marketPounds),
      previousPounds: input.previousPounds,
      damped,
    },
  };
}

/**
 * Rank each value 0–1 within the list (ties share their average rank). Nulls stay null; with a
 * single value it ranks 0.5.
 */
export function percentiles<K>(entries: Array<[K, number | null]>): Map<K, number | null> {
  const known = entries.filter((e): e is [K, number] => e[1] != null).sort((a, b) => a[1] - b[1]);
  const out = new Map<K, number | null>(entries.map(([k]) => [k, null]));
  if (known.length === 1) {
    out.set(known[0][0], 0.5);
    return out;
  }
  let i = 0;
  while (i < known.length) {
    let j = i;
    while (j + 1 < known.length && known[j + 1][1] === known[i][1]) j++;
    const rank = (i + j) / 2 / (known.length - 1);
    for (let k = i; k <= j; k++) out.set(known[k][0], rank);
    i = j + 1;
  }
  return out;
}
