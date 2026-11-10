import { describe, expect, it } from "vitest";
import { packOdds, parsePackConfig, slotOdds } from "@/domain/packs/config";
import { FOOTBALL_PACKS } from "@/config/packs";

describe("published pack odds", () => {
  it("a slot's tier chances add up to 100%", () => {
    for (const p of FOOTBALL_PACKS) {
      for (const slot of parsePackConfig(p.config).slots) {
        const o = slotOdds(slot);
        expect(o.BRONZE + o.SILVER + o.GOLD).toBeCloseTo(1, 10);
      }
    }
  });
  it("works out exclusive upgrades and the chance of at least one", () => {
    const cfg = parsePackConfig({
      mode: "POOL",
      slots: [{ label: "x", count: 2, base: "BRONZE", upgrades: [{ category: "SILVER", chanceBp: 2000 }, { category: "GOLD", chanceBp: 500 }] }],
    });
    expect(slotOdds(cfg.slots[0])).toEqual({ BRONZE: 0.75, SILVER: 0.2, GOLD: 0.05 });
    const o = packOdds(cfg);
    expect(o.expected.GOLD).toBeCloseTo(0.1);
    expect(o.atLeastOne.GOLD).toBeCloseTo(1 - 0.95 ** 2);
  });
});
