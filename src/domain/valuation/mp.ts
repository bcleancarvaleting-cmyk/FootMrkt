import type { Category } from "../packs/config";

/**
 * MX — indicative market value (spec §4.2). MX is a valuation display only: it is not cash,
 * not withdrawable and not a promise of resale value.
 *
 * The algorithm is deliberately simple and explainable: every input and multiplier is
 * returned in `signals` and stored with the valuation so any number can be audited.
 * STATUS: PROPOSED — the final methodology needs product-owner approval (spec §18 "MX rules").
 */

export interface ValuationConfig {
  method: string;
  /** Pence per MX for the indicative money reference. Spec example: 178 MX ≈ £178. */
  pencePerMp: number;
  baseMp: Record<Category, number>;
  minMp: number;
  /** Issued-supply level at which scarcity is neutral. */
  referenceSupply: number;
  scarcityRange: [number, number];
  /** Points per gameweek at which form is neutral. */
  referenceFormPoints: number;
  formWeight: number;
  formRange: [number, number];
  leagueTierMultiplier: Record<number, number>;
  /** Completed sales only count once there are this many from distinct buyer/seller pairs. */
  minSalesForMarketSignal: number;
  marketWeight: number;
  /** Max relative change from the previous valuation in one run (anti-manipulation damping). */
  maxChangePerRun: number;
}

export const VALUATION_CONFIG: ValuationConfig = {
  method: "mp-v1",
  pencePerMp: 100,
  baseMp: { BRONZE: 1, SILVER: 3, GOLD: 8 },
  minMp: 1,
  referenceSupply: 50,
  scarcityRange: [0.75, 1.5],
  referenceFormPoints: 6,
  formWeight: 0.3,
  formRange: [0.7, 1.6],
  leagueTierMultiplier: { 1: 1.25, 2: 1.0, 3: 0.9, 4: 0.8 },
  minSalesForMarketSignal: 3,
  marketWeight: 0.5,
  maxChangePerRun: 0.15,
};

export interface Sale {
  priceMinor: number;
  buyerId: string;
  sellerId: string;
}

export interface ValuationInput {
  category: Category;
  leagueTier: number;
  issuedSupply: number;
  recentGameweekPoints: number[];
  recentSales: Sale[];
  previousMp: number | null;
}

export interface ValuationResult {
  valueMp: number;
  signals: Record<string, unknown>;
}

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Only count one sale per buyer/seller pair (the latest), and ignore self-dealing, so a pair
 * of colluding accounts cannot move the value by trading back and forth.
 */
export function eligibleSales(sales: Sale[]): Sale[] {
  const byPair = new Map<string, Sale>();
  for (const s of sales) {
    if (s.buyerId === s.sellerId) continue;
    const key = [s.buyerId, s.sellerId].sort().join(":");
    byPair.set(key, s);
  }
  return [...byPair.values()];
}

export function computeMp(input: ValuationInput, cfg: ValuationConfig = VALUATION_CONFIG): ValuationResult {
  const base = cfg.baseMp[input.category];
  const scarcity = clamp(Math.pow(cfg.referenceSupply / Math.max(1, input.issuedSupply), 0.25), cfg.scarcityRange);
  const avgForm = input.recentGameweekPoints.length
    ? input.recentGameweekPoints.reduce((s, p) => s + p, 0) / input.recentGameweekPoints.length
    : cfg.referenceFormPoints;
  const form = clamp(1 + ((avgForm - cfg.referenceFormPoints) / cfg.referenceFormPoints) * cfg.formWeight, cfg.formRange);
  const league = cfg.leagueTierMultiplier[input.leagueTier] ?? 1;
  const model = base * scarcity * form * league;

  const sales = eligibleSales(input.recentSales);
  const marketMp =
    sales.length >= cfg.minSalesForMarketSignal ? median(sales.map((s) => s.priceMinor)) / cfg.pencePerMp : null;
  let blended = marketMp === null ? model : (1 - cfg.marketWeight) * model + cfg.marketWeight * marketMp;

  let damped = false;
  if (input.previousMp !== null && input.previousMp > 0) {
    const lo = input.previousMp * (1 - cfg.maxChangePerRun);
    const hi = input.previousMp * (1 + cfg.maxChangePerRun);
    if (blended < lo || blended > hi) {
      blended = clamp(blended, [lo, hi]);
      damped = true;
    }
  }
  const valueMp = Math.max(cfg.minMp, Math.round(blended));

  return {
    valueMp,
    signals: {
      method: cfg.method,
      base,
      scarcity: round(scarcity),
      issuedSupply: input.issuedSupply,
      form: round(form),
      avgFormPoints: round(avgForm),
      gameweeksConsidered: input.recentGameweekPoints.length,
      league: league,
      leagueTier: input.leagueTier,
      model: round(model),
      salesConsidered: sales.length,
      salesIgnored: input.recentSales.length - sales.length,
      marketMp: marketMp === null ? null : round(marketMp),
      previousMp: input.previousMp,
      damped,
    },
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** "≈ £178" — always rendered next to MX and labelled indicative. */
export function indicativeMoney(valueMp: number, cfg: ValuationConfig = VALUATION_CONFIG): string {
  const pence = valueMp * cfg.pencePerMp;
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
}
