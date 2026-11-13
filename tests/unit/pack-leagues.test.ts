import { describe, expect, it } from "vitest";
import { FOOTBALL_PACKS } from "@/config/packs";
import type { PackConfig } from "@/domain/packs/config";
import { PACK_LEAGUES, leaguesInPack, type LeagueStock } from "@/domain/packs/pack-leagues";

// What's packable at launch: Golds in the Premier League and Championship, Silvers there too,
// Bronze everywhere — League One and League Two are all Bronze.
const stock: LeagueStock[] = [
  ...["GOLD", "SILVER", "BRONZE"].map((category) => ({ code: "EPL", category, isTopFlight: true, tier: 1, country: "ENG" })),
  ...["GOLD", "SILVER", "BRONZE"].map((category) => ({ code: "CHA", category, isTopFlight: false, tier: 2, country: "ENG" })),
  { code: "LG1", category: "BRONZE", isTopFlight: false, tier: 3, country: "ENG" },
  { code: "LG2", category: "BRONZE", isTopFlight: false, tier: 4, country: "ENG" },
];
const shown = (code: string, tier: keyof typeof PACK_LEAGUES) => {
  const holds = leaguesInPack(FOOTBALL_PACKS.find((p) => p.code === code)!.config as PackConfig, stock);
  return PACK_LEAGUES[tier].filter((l) => holds.has(l));
};

describe("league logos on the England packs", () => {
  it("Gold shows the Premier League and Championship", () => {
    expect(shown("football-eng-gold", "gold")).toEqual(["EPL", "CHA"]);
  });
  it("Silver shows only leagues with Silver or Gold cards (League One and Two have none)", () => {
    expect(shown("football-eng-silver", "silver")).toEqual(["EPL", "CHA"]);
  });
  it("Bronze shows League One and League Two", () => {
    expect(shown("football-eng-bronze", "bronze")).toEqual(["LG1", "LG2"]);
  });
  it("a league drops off a pack when its players can't come out of it", () => {
    const holds = leaguesInPack(FOOTBALL_PACKS.find((p) => p.code === "football-eng-gold")!.config as PackConfig, stock.filter((s) => s.code !== "CHA"));
    expect(PACK_LEAGUES.gold.filter((l) => holds.has(l))).toEqual(["EPL"]);
  });
});
