import { randomInt } from "node:crypto";

/**
 * Source of randomness for everything that affects outcomes (pack contents, starter packs).
 * Production uses node:crypto (CSPRNG). Tests inject a deterministic source.
 * Every draw is recorded so the outcome is auditable (spec §5.3).
 */
export interface RandomSource {
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

export const cryptoRandom: RandomSource = {
  int(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error(`RandomSource.int: maxExclusive must be a positive integer, got ${maxExclusive}`);
    }
    return randomInt(maxExclusive);
  },
};

/** Deterministic PRNG (mulberry32) — tests and the DEV data simulator only. Never for packs in production. */
export function seededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int(maxExclusive) {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error(`RandomSource.int: maxExclusive must be a positive integer, got ${maxExclusive}`);
      }
      return Math.floor(next() * maxExclusive);
    },
  };
}

export interface DrawRecord {
  purpose: string;
  range: number;
  result: number;
}

/** Wraps a RandomSource and records every draw for the audit trail. */
export class AuditedRandom implements RandomSource {
  readonly draws: DrawRecord[] = [];
  constructor(
    private readonly source: RandomSource,
    private purpose = "draw",
  ) {}

  withPurpose(purpose: string): this {
    this.purpose = purpose;
    return this;
  }

  int(maxExclusive: number): number {
    const result = this.source.int(maxExclusive);
    this.draws.push({ purpose: this.purpose, range: maxExclusive, result });
    return result;
  }
}

/** Pick by integer weights. Weights must be non-negative integers with a positive sum. */
export function weightedPick<T>(rng: RandomSource, items: ReadonlyArray<{ value: T; weight: number }>): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (total <= 0) throw new Error("weightedPick: total weight must be positive");
  let roll = rng.int(total);
  for (const item of items) {
    if (roll < item.weight) return item.value;
    roll -= item.weight;
  }
  throw new Error("weightedPick: unreachable");
}
