import { describe, expect, it } from "vitest";
import { FOOTBALL_PACKS } from "@/config/packs";
import { advertisedGuarantee, cardCount, categoryRank, parsePackConfig } from "@/domain/packs/config";
import { honoursGuarantees, planPack } from "@/domain/packs/compose";
import { seededRandom } from "@/domain/random";

const pack = (code: string) => parsePackConfig(FOOTBALL_PACKS.find((p) => p.code === code)!.config);

describe("pack configs", () => {
  it("all seeded configs are valid", () => {
    for (const p of FOOTBALL_PACKS) expect(() => parsePackConfig(p.config)).not.toThrow();
  });

  it("regular packs have six cards; each of the four league starters has 7 + 4", () => {
    expect(cardCount(pack("football-bronze"))).toBe(6);
    expect(cardCount(pack("football-silver"))).toBe(6);
    expect(cardCount(pack("football-gold"))).toBe(6);
    for (const code of ["football-starter", "football-starter-cha", "football-starter-lg1", "football-starter-lg2"]) expect(cardCount(pack(code))).toBe(11);
  });

  it("advertises the guaranteed floor", () => {
    expect(advertisedGuarantee(pack("football-gold"))).toEqual({ BRONZE: 6, SILVER: 2, GOLD: 2 });
    expect(advertisedGuarantee(pack("football-silver"))).toEqual({ BRONZE: 6, SILVER: 6, GOLD: 0 });
  });

  it("rejects upgrades that are not above the base category", () => {
    expect(() =>
      parsePackConfig({ mode: "POOL", slots: [{ label: "x", count: 1, base: "SILVER", upgrades: [{ category: "BRONZE", chanceBp: 10 }] }] }),
    ).toThrow();
  });

  it("rejects tradeable starter (MINT) packs", () => {
    expect(() => parsePackConfig({ mode: "MINT", nonTradeable: false, slots: [{ label: "x", count: 1, base: "BRONZE" }] })).toThrow();
  });
});

describe("planPack", () => {
  it("never plans a slot below its guaranteed floor, across many rolls", () => {
    for (const code of ["football-bronze", "football-silver", "football-gold", "football-starter"]) {
      const cfg = pack(code);
      for (let seed = 0; seed < 500; seed++) {
        const plan = planPack(cfg, seededRandom(seed));
        expect(plan).toHaveLength(cardCount(cfg));
        for (const s of plan) expect(categoryRank[s.category]).toBeGreaterThanOrEqual(categoryRank[s.guaranteedCategory]);
      }
    }
  });

  it("upgrades happen at roughly the configured rate", () => {
    const cfg = pack("football-bronze");
    let silvers = 0;
    const n = 4000;
    for (let seed = 0; seed < n; seed++) silvers += planPack(cfg, seededRandom(seed)).filter((s) => s.category === "SILVER").length;
    expect(silvers / n).toBeGreaterThan(0.2);
    expect(silvers / n).toBeLessThan(0.3);
  });

  it("each league starter is one league only, with a full squad and bench (2 keepers)", () => {
    const tiers: Record<string, number> = { "football-starter": 1, "football-starter-cha": 2, "football-starter-lg1": 3, "football-starter-lg2": 4 };
    for (const [code, tier] of Object.entries(tiers)) {
      const cfg = pack(code);
      for (let seed = 0; seed < 200; seed++) {
        const plan = planPack(cfg, seededRandom(seed));
        expect(plan.every((s) => s.filters.leagueTiers?.length === 1 && s.filters.leagueTiers[0] === tier)).toBe(true);
        const positions = plan.flatMap((s) => s.filters.positions ?? []);
        expect(positions.filter((p) => p === "GK")).toHaveLength(2);
        expect(positions.filter((p) => p === "DEF")).toHaveLength(3);
        expect(positions.filter((p) => p === "MID")).toHaveLength(3);
        expect(positions.filter((p) => p === "ATT")).toHaveLength(3);
      }
    }
    // The Premier League has (almost) no Bronze players, so its starter is all Silver.
    expect(planPack(pack("football-starter"), seededRandom(1)).every((s) => s.category === "SILVER")).toBe(true);
  });

  it("gold packs: always ≥2 Golds, sometimes 3 or 4, never more; the rest Bronze/Silver", () => {
    const cfg = pack("football-gold");
    const seen = new Set<number>();
    for (let seed = 0; seed < 3000; seed++) {
      const golds = planPack(cfg, seededRandom(seed)).filter((s) => s.category === "GOLD").length;
      expect(golds).toBeGreaterThanOrEqual(2);
      expect(golds).toBeLessThanOrEqual(4);
      seen.add(golds);
    }
    expect([...seen].sort()).toEqual([2, 3, 4]);
  });

  it("gold-pack Golds are top-flight only", () => {
    const plan = planPack(pack("football-gold"), seededRandom(1));
    expect(plan.slice(0, 2).every((s) => s.category === "GOLD" && s.filters.topFlightOnly)).toBe(true);
  });

  it("honoursGuarantees detects a downgrade", () => {
    const plan = planPack(pack("football-gold"), seededRandom(1));
    const ok = plan.map((p) => p.category);
    expect(honoursGuarantees(plan, ok)).toBe(true);
    expect(honoursGuarantees(plan, ["SILVER", ...ok.slice(1)])).toBe(false);
  });
});
