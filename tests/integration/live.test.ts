import { beforeEach, describe, expect, it } from "vitest";
import { toStatLine } from "@/domain/football/scoring";
import { submitEntry } from "@/server/competitions";
import { db } from "@/server/db";
import { createGameweek, simulateFixturesNow } from "@/server/gameweeks";
import { alertGoals, awardMotm, liveBoard, matchClock } from "@/server/live";
import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer } from "@/domain/football/scoring";
import { openPack } from "@/server/packs";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

async function squad(userId: string, entitlementId: string) {
  const res = await openPack(userId, entitlementId);
  const cards = await db.cardInstance.findMany({ where: { id: { in: res.cards.map((c) => c.cardId) } }, include: { template: { include: { player: true } } } });
  const by = (p: string) => cards.filter((c) => c.template.player.position === p);
  const starters = (["GK", "DEF", "DEF", "MID", "MID", "ATT", "ATT"] as const).map((pos, i, all) => ({ cardId: by(pos)[all.slice(0, i).filter((x) => x === pos).length].id, position: pos }));
  const used = new Set(starters.map((s) => s.cardId));
  return { formation: "2-2-2", starters, bench: cards.filter((c) => !used.has(c.id)).slice(0, 1).map((c) => c.id) };
}

describe("matchday live", () => {
  it("match clock: provider minute, else estimated with a half-time break", () => {
    const ko = new Date("2026-11-14T15:00:00Z");
    expect(matchClock("LIVE", ko, 67)).toBe("67'");
    expect(matchClock("LIVE", ko, null, new Date("2026-11-14T15:30:00Z"))).toBe("30'");
    expect(matchClock("LIVE", ko, null, new Date("2026-11-14T15:50:00Z"))).toBe("HT");
    expect(matchClock("LIVE", ko, null, new Date("2026-11-14T16:20:00Z"))).toBe("65'");
    expect(matchClock("FINISHED", ko, 90)).toBeNull();
  });

  it("shows today's scores, your live points and rank, and tells you once per goal by your players", async () => {
    const now = new Date();
    const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000), actorId: null });
    const open = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id, code: { endsWith: "-open" } } });
    const a = await makeUser("livea");
    await submitEntry(a.userId, open.id, await squad(a.userId, a.starterEntitlementId));
    await simulateFixturesNow(gw.id, "all", null);

    const { matchdayCard } = await import("@/server/matchday-card");
    const card = await matchdayCard(a.userId);
    expect(card).toMatchObject({ gameweek: 1, live: true, rank: 1, entries: 1 });
    expect(card!.top.length).toBeGreaterThan(0);
    expect(card!.top[0].points).toBeGreaterThanOrEqual(card!.top.at(-1)!.points);

    const board = await liveBoard(a.userId);
    expect(board.fixtures.length).toBeGreaterThan(0);
    expect(board.mine?.entries[0]).toMatchObject({ competitionId: open.id, rank: 1, entries: 1 });
    expect(board.mine?.players).toHaveLength(8);

    // Make one of their players a scorer in a live match.
    const pick = await db.competitionSelection.findFirstOrThrow({ where: { entry: { userId: a.userId } } });
    const stat = await db.playerMatchStat.findFirst({ where: { playerId: pick.playerId, isCurrent: true } });
    if (stat) {
      const line = toStatLine(stat.stats);
      await db.playerMatchStat.update({ where: { id: stat.id }, data: { stats: { ...(stat.stats as object), goals: 2, minutes: Math.max(line.minutes, 60) } } });
      await db.fixture.update({ where: { id: stat.fixtureId }, data: { status: "LIVE", finalisedAt: null } });
      await alertGoals();
      await alertGoals();
      const goals = await db.notification.findMany({ where: { userId: a.userId, kind: "GOAL" } });
      expect(goals).toHaveLength(2);
      expect(goals.some((g) => g.title.includes("brace"))).toBe(true);
    }
  });

  it("Man of the Match: the top scorer of each finished game gets +3 in squads, once", async () => {
    const rules = getScoringRules(CURRENT_SCORING_RULES);
    const line = toStatLine({ minutes: 90, goals: 1 });
    expect(scorePlayer(rules, "MID", [line], 1).points - scorePlayer(rules, "MID", [line]).points).toBe(3);
    expect(scorePlayer(rules, "MID", [toStatLine({ minutes: 0 })], 1).points).toBe(0); // must have played

    const now = new Date();
    const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000), actorId: null });
    const open = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id, code: { endsWith: "-open" } } });
    expect(open.scoringRules).toBe("football-scoring-v3-draft");
    const a = await makeUser("motma");
    await submitEntry(a.userId, open.id, await squad(a.userId, a.starterEntitlementId));
    await simulateFixturesNow(gw.id, "all", null);
    const before = (await db.competitionEntry.findFirstOrThrow({ where: { userId: a.userId } })).provisionalPoints ?? 0;

    // Make one of their starters the standout in their game.
    const starters = await db.competitionSelection.findMany({ where: { entry: { userId: a.userId }, slot: "STARTER", isCaptain: false } });
    const stat = await db.playerMatchStat.findFirstOrThrow({ where: { playerId: { in: starters.map((x) => x.playerId) }, isCurrent: true } });
    const pick = starters.find((x) => x.playerId === stat.playerId)!;
    await db.playerMatchStat.update({ where: { id: stat.id }, data: { stats: { ...(stat.stats as object), minutes: 90, goals: 4 } } });
    await db.fixture.updateMany({ where: { gameweekId: gw.id }, data: { finalisedAt: new Date() } });
    const { refreshProvisional } = await import("@/server/gameweeks");
    await refreshProvisional(gw.id);
    const withGoals = (await db.competitionEntry.findFirstOrThrow({ where: { userId: a.userId } })).provisionalPoints ?? 0;
    expect(withGoals).toBeGreaterThan(before);

    expect(await awardMotm()).toBeGreaterThan(0);
    expect((await db.fixture.findUniqueOrThrow({ where: { id: stat.fixtureId } })).motmPlayerId).toBe(pick.playerId);
    const after = (await db.competitionEntry.findFirstOrThrow({ where: { userId: a.userId } })).provisionalPoints ?? 0;
    expect(after - withGoals).toBe(3);
    expect(await db.notification.count({ where: { userId: a.userId, kind: "MOTM" } })).toBeGreaterThanOrEqual(1);
    expect(await awardMotm()).toBe(0); // unchanged on the next run
  });
});
