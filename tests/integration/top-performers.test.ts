import { beforeEach, describe, expect, it } from "vitest";
import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer, toStatLine } from "@/domain/football/scoring";
import { db } from "@/server/db";
import { createGameweek, simulateFixturesNow } from "@/server/gameweeks";
import { playerDatabase } from "@/server/player-drops";
import { performanceTable, topPerLeague } from "@/server/top-performers";
import { buildWorld, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

async function playedGameweek(number: number) {
  const now = new Date();
  const gw = await createGameweek({ season: "T", number, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000), actorId: null });
  await simulateFixturesNow(gw.id, "all", null);
  await db.gameweek.update({ where: { id: gw.id }, data: { status: "SETTLED" } });
  return gw;
}

describe("top performers", () => {
  it("ranks players by MATCHX points from real stats, per window and per league", async () => {
    expect(await performanceTable()).toEqual([]);
    await playedGameweek(1);
    await playedGameweek(2);

    const season = await performanceTable({ window: "season" });
    expect(season.length).toBeGreaterThan(0);
    for (let i = 1; i < season.length; i++) expect(season[i - 1].points).toBeGreaterThanOrEqual(season[i].points);

    // The leader's points match the scoring rules applied to their stat lines, gameweek by gameweek.
    const top = season[0];
    const stats = await db.playerMatchStat.findMany({ where: { playerId: top.playerId, isCurrent: true }, include: { fixture: true } });
    const rules = getScoringRules(CURRENT_SCORING_RULES);
    const byGw = new Map<string, ReturnType<typeof toStatLine>[]>();
    for (const s of stats) {
      const l = toStatLine(s.stats);
      if (l.minutes > 0) byGw.set(s.fixture.gameweekId, [...(byGw.get(s.fixture.gameweekId) ?? []), l]);
    }
    const expected = [...byGw.values()].reduce((sum, lines) => sum + scorePlayer(rules, top.position, lines).points, 0);
    expect(top.points).toBeCloseTo(expected, 1);
    expect(top.byGameweek.length).toBe(byGw.size);

    // "Last gameweek" only counts the latest one.
    const last = await performanceTable({ window: "last" });
    expect(last.every((r) => r.byGameweek.length === 1)).toBe(true);

    // Filters and the per-league leader.
    const t2 = await performanceTable({ window: "season", league: "T2" });
    expect(t2.every((r) => r.league === "T2")).toBe(true);
    const mids = await performanceTable({ window: "season", position: "MID" });
    expect(mids.every((r) => r.position === "MID")).toBe(true);
    const leaders = await topPerLeague("season");
    expect(leaders.get("T2")?.[0].playerId).toBe(t2[0].playerId);
    expect(leaders.get("T1")?.[0].league).toBe("T1");

    // Admin player database can be narrowed to the leaders (used by "top performer from each league").
    const ids = [...leaders.values()].flat().map((r) => r.playerId);
    const rows = await playerDatabase({ ids });
    expect(new Set(rows.map((r) => r.playerId))).toEqual(new Set(ids));
    expect(await playerDatabase({ ids: [] })).toEqual([]);
  });
});
