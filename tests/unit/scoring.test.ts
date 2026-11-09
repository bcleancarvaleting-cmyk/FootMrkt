import { describe, expect, it } from "vitest";
import { EMPTY_STAT_LINE, getScoringRules, scorePlayer, scoreSquad, toStatLine, type PlayerGameweekData, type ScoringSelection, type StatLine } from "@/domain/football/scoring";
import { getRosterRules } from "@/domain/football/rules";
import type { Position } from "@/domain/packs/config";

const rules = getScoringRules("football-scoring-v1-draft");
const roster = getRosterRules("football-roster-v1");
const line = (o: Partial<StatLine>): StatLine => ({ ...EMPTY_STAT_LINE, ...o });

describe("scoring v2 (clean sheets for GK/DEF only)", () => {
  const v2 = getScoringRules("football-scoring-v2-draft");
  it("gives clean sheets to goalkeepers and defenders only", () => {
    expect(scorePlayer(v2, "GK", [line({ minutes: 90 })]).points).toBe(9);
    expect(scorePlayer(v2, "DEF", [line({ minutes: 90 })]).points).toBe(9);
    expect(scorePlayer(v2, "MID", [line({ minutes: 90 })]).points).toBe(4);
    expect(scorePlayer(v2, "ATT", [line({ minutes: 90 })]).points).toBe(4);
  });
});

describe("scorePlayer (draft table §6.4)", () => {
  it("scores a striker's brace", () => {
    const r = scorePlayer(rules, "ATT", [line({ minutes: 90, goals: 2, assists: 1, goalsConceded: 1, yellowCards: 1 })]);
    // appearance 2 + 60min 2 + goals 20 + assist 6 + yellow -3
    expect(r.points).toBe(27);
  });

  it("scores a goalkeeper clean sheet, saves and penalty save", () => {
    const r = scorePlayer(rules, "GK", [line({ minutes: 90, saves: 7, penaltySaves: 1 })]);
    // 2 + 2 + CS 5 + pen save 8 + 2×(3 saves) 4
    expect(r.points).toBe(21);
  });

  it("applies goals-conceded penalty only to GK/DEF", () => {
    expect(scorePlayer(rules, "DEF", [line({ minutes: 90, goalsConceded: 4 })]).points).toBe(2 + 2 - 2);
    expect(scorePlayer(rules, "MID", [line({ minutes: 90, goalsConceded: 4 })]).points).toBe(2 + 2);
  });

  it("gives nothing without an appearance, and no clean sheet under 60 minutes", () => {
    expect(scorePlayer(rules, "DEF", [line({ minutes: 0 })]).points).toBe(0);
    expect(scorePlayer(rules, "DEF", [line({ minutes: 30 })]).points).toBe(2);
  });

  it("sums double gameweeks", () => {
    expect(scorePlayer(rules, "ATT", [line({ minutes: 90, goals: 1 }), line({ minutes: 20 })]).points).toBe(2 + 2 + 10 + 5 + 2); // incl. clean sheet in the first fixture
  });

  it("toStatLine sanitises untrusted input", () => {
    expect(toStatLine({ goals: "2", minutes: -5, junk: 1 })).toEqual(line({ goals: 2 }));
  });
});

function sel(cardId: string, position: Position, slot: "STARTER" | "BENCH", order: number): ScoringSelection {
  return { cardId, playerId: `p-${cardId}`, position, slot, order };
}
const squad: ScoringSelection[] = [
  sel("gk", "GK", "STARTER", 1), sel("d1", "DEF", "STARTER", 2), sel("d2", "DEF", "STARTER", 3),
  sel("m1", "MID", "STARTER", 4), sel("m2", "MID", "STARTER", 5), sel("a1", "ATT", "STARTER", 6), sel("a2", "ATT", "STARTER", 7),
  sel("s1", "ATT", "BENCH", 1), sel("s2", "DEF", "BENCH", 2), sel("s3", "GK", "BENCH", 3), sel("s4", "MID", "BENCH", 4),
];
const played = (minutes = 90): PlayerGameweekData => ({ appearance: "PLAYED", lines: [{ statId: `st-${Math.random()}`, line: line({ minutes }) }] });
const dnp: PlayerGameweekData = { appearance: "DID_NOT_PLAY", lines: [] };

function data(overrides: Record<string, PlayerGameweekData>) {
  const m = new Map<string, PlayerGameweekData>();
  for (const s of squad) m.set(s.playerId, overrides[s.cardId] ?? { appearance: "PLAYED", lines: [{ statId: `st-${s.cardId}`, line: line({ minutes: 90 }) }] });
  return m;
}

describe("scoreSquad automatic substitutions (§6.3)", () => {
  it("no subs when every starter plays; bench does not count", () => {
    const r = scoreSquad(rules, roster, squad, data({}));
    expect(r.substitutions).toEqual([]);
    expect(r.selections.filter((s) => s.counted).map((s) => s.cardId).sort()).toEqual(["a1", "a2", "d1", "d2", "gk", "m1", "m2"]);
  });

  it("uses Sub 1 first when compatible", () => {
    const r = scoreSquad(rules, roster, squad, data({ a1: dnp }));
    expect(r.substitutions).toEqual([{ off: "a1", on: "s1", benchOrder: 1 }]);
    expect(r.formationUsed).toBe("2-2-2");
  });

  it("skips incompatible subs to keep an allowed formation (DEF out → Sub 2 DEF, not Sub 1 ATT)", () => {
    const r = scoreSquad(rules, roster, squad, data({ d1: dnp }));
    expect(r.substitutions).toEqual([{ off: "d1", on: "s2", benchOrder: 2 }]);
  });

  it("goalkeeper is only replaced by a goalkeeper", () => {
    const r = scoreSquad(rules, roster, squad, data({ gk: dnp }));
    expect(r.substitutions).toEqual([{ off: "gk", on: "s3", benchOrder: 3 }]);
  });

  it("skips bench players who also did not play, and leaves a gap if nobody fits", () => {
    const r = scoreSquad(rules, roster, squad, data({ a1: dnp, s1: dnp }));
    expect(r.substitutions).toEqual([]);
    expect(r.selections.find((s) => s.cardId === "a1")!.counted).toBe(false);
  });

  it("does not substitute a starter whose fixture is still pending", () => {
    const r = scoreSquad(rules, roster, squad, data({ a1: { appearance: "PENDING", lines: [] } }));
    expect(r.substitutions).toEqual([]);
    expect(r.selections.find((s) => s.cardId === "a1")!.counted).toBe(true);
  });

  it("v2 formations allow cross-position subs that land on 2-3-1 or 3-2-1", () => {
    const v2 = getRosterRules("football-roster-v2");
    // ATT out; Sub 1 is an ATT anyway.
    expect(scoreSquad(rules, v2, squad, data({ a1: dnp })).substitutions[0].on).toBe("s1");
    // ATT out and Sub 1 didn't play → Sub 2 (DEF) gives 3-2-1, allowed in v2 (not in v1).
    const r = scoreSquad(rules, v2, squad, data({ a1: dnp, s1: dnp }));
    expect(r.substitutions).toEqual([{ off: "a1", on: "s2", benchOrder: 2 }]);
    expect(r.formationUsed).toBe("3-2-1");
    expect(scoreSquad(rules, roster, squad, data({ a1: dnp, s1: dnp })).substitutions).toEqual([]);
  });

  it("is reproducible: same inputs give the same total and hash", () => {
    const d = data({ a1: dnp });
    const a = scoreSquad(rules, roster, squad, d);
    const b = scoreSquad(rules, roster, [...squad].reverse(), d);
    expect(a.total).toBe(b.total);
    expect(a.inputHash).toBe(b.inputHash);
  });

  void played;
});
