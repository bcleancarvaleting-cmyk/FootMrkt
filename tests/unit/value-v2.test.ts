import { describe, expect, it } from "vitest";
import { VALUE_V2, computeValueV2, curvePrice, percentiles } from "@/domain/valuation/v2";

const base = { formPct: null, marketValuePct: null, demandPct: 0, recentSales: [], previousPounds: null };

describe("value v2", () => {
  it("prices from £0.50 to £20 on a curve: a few stars at the top, most players cheap", () => {
    expect(curvePrice(0)).toBe(0.5);
    expect(curvePrice(1)).toBe(20);
    expect(curvePrice(0.5)).toBeCloseTo(2.94, 2);
    expect(computeValueV2({ ...base, formPct: 1, marketValuePct: 1 }).pounds).toBe(20);
    expect(computeValueV2({ ...base, formPct: 0, marketValuePct: 0 }).pounds).toBe(0.5);
  });

  it("form and market value set the price; demand adds up to 25%; capped at £20", () => {
    const mid = computeValueV2({ ...base, formPct: 0.7, marketValuePct: 0.7 }).pounds;
    const wanted = computeValueV2({ ...base, formPct: 0.7, marketValuePct: 0.7, demandPct: 1 }).pounds;
    expect(wanted).toBeCloseTo(mid * 1.25, 1);
    expect(computeValueV2({ ...base, formPct: 1, marketValuePct: 1, demandPct: 1 }).pounds).toBe(20);
    // With no stats yet, market value alone decides.
    expect(computeValueV2({ ...base, marketValuePct: 0.9 }).pounds).toBeCloseTo(curvePrice(0.9), 2);
  });

  it("real sales pull 20% of the way once there are 3 independent ones; prices move at most 10% a run", () => {
    const sales = [1, 2, 3].map((i) => ({ priceMinor: 1000, buyerId: `b${i}`, sellerId: `s${i}` }));
    const model = computeValueV2({ ...base, formPct: 0.5, marketValuePct: 0.5 }).pounds;
    const withSales = computeValueV2({ ...base, formPct: 0.5, marketValuePct: 0.5, recentSales: sales }).pounds;
    expect(withSales).toBeCloseTo(0.8 * model + 0.2 * 10, 1);
    const damped = computeValueV2({ ...base, formPct: 1, marketValuePct: 1, previousPounds: 5 });
    expect(damped.pounds).toBe(5.5);
    expect(damped.signals.damped).toBe(true);
    expect(VALUE_V2.maxPounds).toBe(20);
  });

  it("ranks 0–1 with ties sharing their rank", () => {
    const r = percentiles<string>([["a", 1], ["b", 2], ["c", 2], ["d", 3], ["e", null]]);
    expect([r.get("a"), r.get("b"), r.get("c"), r.get("d"), r.get("e")]).toEqual([0, 0.5, 0.5, 1, null]);
  });
});
