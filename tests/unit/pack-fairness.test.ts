import { describe, expect, it } from "vitest";
import { FOOTBALL_PACKS } from "@/config/packs";
import { planPack } from "@/domain/packs/compose";
import { parsePackConfig } from "@/domain/packs/config";
import { cryptoRandom } from "@/domain/random";

/**
 * Fairness check: with the production random source (node:crypto), how often each tier comes out
 * of a pack matches the published odds. Nothing is hand-built — every slot rolls independently.
 */
const N = 20_000;
const cfg = (code: string) => parsePackConfig(FOOTBALL_PACKS.find((p) => p.code === code)!.config);

describe("packs are random and match the published odds", () => {
  it("Gold pack wildcards: 15% Gold, 40% Silver, 45% Bronze (±1.5%)", () => {
    const counts = { GOLD: 0, SILVER: 0, BRONZE: 0 };
    for (let i = 0; i < N; i++) {
      const wild = planPack(cfg("football-eng-gold"), cryptoRandom).filter((s) => s.label === "Wildcard");
      for (const s of wild) counts[s.category]++;
    }
    const total = N * 2;
    expect(Math.abs(counts.GOLD / total - 0.15)).toBeLessThan(0.015);
    expect(Math.abs(counts.SILVER / total - 0.4)).toBeLessThan(0.015);
    expect(Math.abs(counts.BRONZE / total - 0.45)).toBeLessThan(0.015);
  });

  it("Silver pack bonus slot: 20% Gold (±1.5%)", () => {
    let gold = 0;
    for (let i = 0; i < N; i++) if (planPack(cfg("football-eng-silver"), cryptoRandom).some((s) => s.category === "GOLD")) gold++;
    expect(Math.abs(gold / N - 0.2)).toBeLessThan(0.015);
  });

  it("two packs in a row are not the same (no fixed sequences)", () => {
    const a = JSON.stringify(Array.from({ length: 50 }, () => planPack(cfg("football-eng-gold"), cryptoRandom).map((s) => s.category)));
    const b = JSON.stringify(Array.from({ length: 50 }, () => planPack(cfg("football-eng-gold"), cryptoRandom).map((s) => s.category)));
    expect(a).not.toBe(b);
  });
});
