import { describe, expect, it } from "vitest";
import { computeMp, eligibleSales, indicativeMoney, VALUATION_CONFIG } from "@/domain/valuation/mp";

const base = { category: "GOLD" as const, leagueTier: 2, issuedSupply: VALUATION_CONFIG.referenceSupply, recentGameweekPoints: [], recentSales: [], previousMp: null };

describe("MP valuation", () => {
  it("is neutral at reference supply/form", () => {
    expect(computeMp(base).valueMp).toBe(VALUATION_CONFIG.baseMp.GOLD);
  });

  it("rises with form and scarcity, falls with abundance", () => {
    expect(computeMp({ ...base, recentGameweekPoints: [20, 18] }).valueMp).toBeGreaterThan(8);
    expect(computeMp({ ...base, issuedSupply: 5 }).valueMp).toBeGreaterThan(8);
    expect(computeMp({ ...base, issuedSupply: 5000 }).valueMp).toBeLessThan(8);
  });

  it("ignores self-dealing and counts one sale per pair", () => {
    const sales = [
      { priceMinor: 100000, buyerId: "a", sellerId: "b" },
      { priceMinor: 100000, buyerId: "b", sellerId: "a" },
      { priceMinor: 100000, buyerId: "a", sellerId: "a" },
    ];
    expect(eligibleSales(sales)).toHaveLength(1);
    // Not enough distinct sales → market signal ignored entirely.
    expect(computeMp({ ...base, recentSales: sales }).signals.marketMp).toBeNull();
  });

  it("damps large swings against the previous value", () => {
    const sales = ["a", "b", "c", "d"].map((id) => ({ priceMinor: 1_000_000, buyerId: id, sellerId: id + "x" }));
    const r = computeMp({ ...base, recentSales: sales, previousMp: 10 });
    expect(r.valueMp).toBe(Math.round(10 * (1 + VALUATION_CONFIG.maxChangePerRun)));
    expect(r.signals.damped).toBe(true);
  });

  it("formats the indicative money reference", () => {
    expect(indicativeMoney(178)).toBe("£178");
  });
});
