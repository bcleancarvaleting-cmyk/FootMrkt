import { describe, expect, it } from "vitest";
import { tierForValue } from "@/config/tiers";
import { FORMULA_CAP_GBP, formulaValue, loadNamedEstimates } from "@/domain/valuation/estimates";

const p = (o: Partial<Parameters<typeof formulaValue>[0]>) => formulaValue({ id: "x", squadNumber: 8, leagueTier: 1, clubStrength: 96, leagueAvgStrength: 96, ...o });

describe("MATCHX value estimates", () => {
  it("the formula never reaches Gold on its own", () => {
    for (let i = 0; i < 200; i++) expect(p({ id: `id${i}`, clubStrength: 120 })).toBeLessThanOrEqual(FORMULA_CAP_GBP);
    expect(tierForValue(FORMULA_CAP_GBP)).toBe("SILVER");
  });

  it("higher leagues, stronger clubs and first-team shirts are worth more", () => {
    expect(p({ leagueTier: 1 })).toBeGreaterThan(p({ leagueTier: 2 }));
    expect(p({ leagueTier: 4 })).toBeGreaterThan(p({ leagueTier: 5 }));
    expect(p({ clubStrength: 100 })).toBeGreaterThan(p({ clubStrength: 90 }));
    expect(p({ squadNumber: 9 })).toBeGreaterThan(p({ squadNumber: 35 }));
    expect(tierForValue(p({ leagueTier: 5 }))).toBe("BRONZE");
  });

  it("named estimates load, including Championship Golds", () => {
    const named = loadNamedEstimates();
    expect(named.get("MCI|haaland")).toBe(150_000_000);
    expect(tierForValue(named.get("WOL|andre")!)).toBe("GOLD");
    expect(named.size).toBeGreaterThan(400);
  });
});
