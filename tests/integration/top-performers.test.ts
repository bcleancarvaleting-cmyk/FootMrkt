import { beforeEach, describe, expect, it } from "vitest";
import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer, toStatLine } from "@/domain/football/scoring";
import { db } from "@/server/db";
import { createGameweek, simulateFixturesNow } from "@/server/gameweeks";
import { playerDatabase } from "@/server/player-drops";
import { formGuide, performanceTable, topPerLeague } from "@/server/top-performers";
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

describe("daily player drops", () => {
  it("drops in-form players across the leagues once a day at 10am UK, priced from value plus form", async () => {
    const { runDailyDrops, todaysDrops } = await import("@/server/player-drops");
    const { revalueAll } = await import("@/server/valuation");
    await playedGameweek(1);
    await revalueAll();
    const morning = new Date("2026-11-11T08:00:00Z"); // 8am UK: too early
    expect(await runDailyDrops(morning)).toBe(0);
    const at = new Date("2026-11-11T09:30:00Z");
    const n = await runDailyDrops(at);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(25);
    expect(await runDailyDrops(new Date("2026-11-11T15:00:00Z"))).toBe(0); // once a day
    const drops = await db.marketListing.findMany({ where: { house: true, status: "ACTIVE" }, include: { card: { include: { template: { include: { player: { include: { club: { include: { league: true } } } } } } } } } });
    expect(drops).toHaveLength(n);
    expect(new Set(drops.map((d) => d.card.template.playerId)).size).toBe(n);
    for (const d of drops) {
      expect(d.liveAt?.toISOString()).toBe("2026-11-11T10:00:00.000Z");
      expect(d.askingPriceMinor).toBeGreaterThanOrEqual(10);
      expect(d.askingPriceMinor).toBeLessThanOrEqual(10_000);
    }
    expect(new Set(drops.map((d) => d.card.template.player.club?.league.code)).size).toBeGreaterThan(1);
    expect((await todaysDrops(at)).length).toBe(n);
  });

  it("form guide: each player's last 4 club games with real points, oldest first", async () => {
    for (let n = 1; n <= 5; n++) {
      const gw = await playedGameweek(n);
      await db.fixture.updateMany({ where: { gameweekId: gw.id }, data: { status: "FINISHED", kickoffAt: new Date(Date.now() - (10 - n) * 86_400_000) } });
    }
    const season = await performanceTable({ window: "season" });
    const top = season[0];
    const f = (await formGuide([top.playerId])).get(top.playerId)!;
    expect(f.games.length).toBe(4);
    const last4 = top.byGameweek.slice(-4).reduce((a, b) => a + b, 0);
    expect(f.total).toBeCloseTo(last4, 1);
  });
});
