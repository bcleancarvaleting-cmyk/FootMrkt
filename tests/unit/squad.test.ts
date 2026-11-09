import { describe, expect, it } from "vitest";
import { validateSquad, type SquadCard, type SquadSubmission } from "@/domain/football/squad";
import { getRosterRules } from "@/domain/football/rules";
import type { Position } from "@/domain/packs/config";

const rules = getRosterRules("football-roster-v1");
const tactics = getRosterRules("football-roster-v1-tactics");

function card(id: string, pos: Position, category: SquadCard["category"] = "BRONZE"): SquadCard {
  return { cardId: id, playerId: `p-${id}`, playerPosition: pos, category };
}
const cards = new Map<string, SquadCard>(
  [card("gk", "GK"), card("d1", "DEF"), card("d2", "DEF"), card("d3", "DEF"), card("m1", "MID"), card("m2", "MID"),
   card("a1", "ATT"), card("a2", "ATT"), card("b1", "MID"), card("b2", "ATT"), card("b3", "GK", "SILVER")].map((c) => [c.cardId, c]),
);
const valid: SquadSubmission = {
  formation: "2-2-2",
  starters: [
    { cardId: "gk", position: "GK" }, { cardId: "d1", position: "DEF" }, { cardId: "d2", position: "DEF" },
    { cardId: "m1", position: "MID" }, { cardId: "m2", position: "MID" }, { cardId: "a1", position: "ATT" }, { cardId: "a2", position: "ATT" },
  ],
  bench: ["d3", "b1", "b2", "b3"],
};

describe("validateSquad", () => {
  it("accepts the confirmed 1 GK / 2 DEF / 2 MID / 2 ATT + 4 bench structure", () => {
    expect(validateSquad(rules, "OPEN", valid, cards)).toEqual([]);
  });

  it("rejects proposed formations unless the competition opts in", () => {
    const s: SquadSubmission = {
      ...valid,
      formation: "3-2-1",
      starters: [...valid.starters.slice(0, 6).map((x) => (x.cardId === "a1" ? { cardId: "d3", position: "DEF" as const } : x))],
      bench: ["a1", "b1", "b2", "b3"],
    };
    s.starters.push({ cardId: "a2", position: "ATT" });
    s.starters = s.starters.filter((x, i, arr) => arr.findIndex((y) => y.cardId === x.cardId) === i);
    expect(validateSquad(rules, "OPEN", s, cards).map((i) => i.code)).toContain("FORMATION_NOT_ALLOWED");
    expect(validateSquad(tactics, "OPEN", s, cards)).toEqual([]);
  });

  it("enforces counts, positions, duplicates and categories", () => {
    const codes = (s: SquadSubmission, f: Parameters<typeof validateSquad>[1] = "OPEN") => validateSquad(rules, f, s, cards).map((i) => i.code);
    expect(codes({ ...valid, bench: valid.bench.slice(0, 3) })).toContain("WRONG_BENCH_COUNT");
    expect(codes({ ...valid, starters: valid.starters.slice(0, 6) })).toContain("WRONG_STARTER_COUNT");
    expect(codes({ ...valid, starters: valid.starters.map((s) => (s.cardId === "a2" ? { cardId: "b1", position: "ATT" as const } : s)), bench: ["d3", "a2", "b2", "b3"] })).toContain("POSITION_MISMATCH");
    expect(codes({ ...valid, bench: ["d3", "b1", "b2", "gk"] })).toContain("DUPLICATE_CARD");
    expect(codes({ ...valid, bench: ["d3", "b1", "b2", "nope"] })).toContain("UNKNOWN_CARD");
    expect(codes(valid, "BRONZE_ONLY")).toContain("CATEGORY_NOT_ALLOWED");
  });

  it("rejects two cards of the same player", () => {
    const dup = new Map(cards);
    dup.set("b2", { ...card("b2", "ATT"), playerId: "p-a1" });
    expect(validateSquad(rules, "OPEN", valid, dup).map((i) => i.code)).toContain("DUPLICATE_PLAYER");
  });
});
