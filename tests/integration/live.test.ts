import { beforeEach, describe, expect, it } from "vitest";
import { toStatLine } from "@/domain/football/scoring";
import { submitEntry } from "@/server/competitions";
import { db } from "@/server/db";
import { createGameweek, simulateFixturesNow } from "@/server/gameweeks";
import { alertGoals, liveBoard, matchClock } from "@/server/live";
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
});
