import { describe, expect, it } from "vitest";
import { simulateCorrection, simulateMatch, simulatedProvider } from "@/providers/football/simulated";
import type { ProviderPlayer } from "@/providers/football/types";

const squad = (club: string): ProviderPlayer[] =>
  (
    [
      ["GK", 2],
      ["DEF", 6],
      ["MID", 6],
      ["ATT", 4],
    ] as const
  ).flatMap(([position, n]) => Array.from({ length: n }, (_, i) => ({ ref: `${club}-${position}-${i}`, clubRef: club, position })));

const fixture = { providerFixtureId: "fx", homeClubRef: "h", awayClubRef: "a", kickoffAt: new Date(0) };

describe("DEV simulated provider", () => {
  it("produces consistent matches across many seeds (incl. late goals)", () => {
    for (let seed = 0; seed < 1500; seed++) {
      const msgs = simulateMatch(fixture, { club: { ref: "h", strengthHint: 85 }, squad: squad("h") }, { club: { ref: "a", strengthHint: 40 }, squad: squad("a") }, seed);
      const result = msgs.find((m) => m.kind === "FIXTURE_RESULT")!;
      if (result.payload.match_status === "postponed") continue;
      const lines = msgs.filter((m) => m.kind === "PLAYER_STATS").map((m) => ({ ref: m.playerRef!, s: simulatedProvider.normaliseStats(m.payload) }));
      const goals = (side: string) => lines.filter((l) => l.ref.startsWith(side)).reduce((n, l) => n + l.s.goals, 0);
      const ogs = (side: string) => lines.filter((l) => l.ref.startsWith(side)).reduce((n, l) => n + l.s.ownGoals, 0);
      expect(goals("h") + ogs("a")).toBe(result.payload.home_score);
      expect(goals("a") + ogs("h")).toBe(result.payload.away_score);
      expect(lines.every((l) => l.s.minutes > 0 && l.s.minutes <= 90)).toBe(true);
      expect(new Set(lines.map((l) => l.ref)).size).toBe(lines.length);
    }
  });

  it("is deterministic per seed and corrections bump the revision", () => {
    const play = (seed: number) => simulateMatch(fixture, { club: { ref: "h" }, squad: squad("h") }, { club: { ref: "a" }, squad: squad("a") }, seed);
    let seed = 7;
    while (play(seed).length === 1) seed++; // skip postponed fixtures
    const a = play(seed);
    const b = play(seed);
    expect(a).toEqual(b);
    const [corr] = simulateCorrection(a, 1);
    expect(corr.revision).toBe(2);
    expect(corr.providerEventId).not.toBe(a.find((m) => m.playerRef === corr.playerRef)!.providerEventId);
  });
});
