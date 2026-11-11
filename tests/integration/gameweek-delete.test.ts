import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createGameweek, deleteGameweek, simulateFixturesNow } from "@/server/gameweeks";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("deleting a gameweek", () => {
  it("removes an unused gameweek and its fixtures; refuses one with matches or played fixtures", async () => {
    const admin = await makeUser("gwadmin");
    const now = new Date();
    const gw = await createGameweek({ season: "T", number: 9, opensAt: now, firstKickoffAt: new Date(now.getTime() + 3 * 86_400_000), actorId: null });
    const withMatches = await db.competition.count({ where: { gameweekId: gw.id } });
    if (withMatches) {
      await expect(deleteGameweek(admin.userId, gw.id)).rejects.toMatchObject({ code: "IN_USE" });
      await db.competition.deleteMany({ where: { gameweekId: gw.id } });
    }
    await deleteGameweek(admin.userId, gw.id);
    expect(await db.gameweek.count({ where: { id: gw.id } })).toBe(0);
    expect(await db.fixture.count({ where: { gameweekId: gw.id } })).toBe(0);

    const played = await createGameweek({ season: "T", number: 10, opensAt: now, firstKickoffAt: new Date(now.getTime() + 3 * 86_400_000), actorId: null });
    await db.competition.deleteMany({ where: { gameweekId: played.id } });
    await simulateFixturesNow(played.id, 1, null);
    await expect(deleteGameweek(admin.userId, played.id)).rejects.toMatchObject({ code: "IN_USE" });
  });
});

describe("removing a match", () => {
  it("removes a match that hasn't locked; refuses one that has", async () => {
    const { removeCompetition } = await import("@/server/competitions");
    const admin = await makeUser("matchadmin");
    const now = new Date();
    const gw = await createGameweek({ season: "T", number: 11, opensAt: now, firstKickoffAt: new Date(now.getTime() + 3 * 86_400_000), actorId: null });
    const base = { sportId: gw.sportId, gameweekId: gw.id, rosterRules: "football-roster-v3", scoringRules: "football-scoring-v2-draft", entryOpensAt: now, format: "OPEN" as const, rewards: [], requirements: {} };
    const open = await db.competition.create({ data: { ...base, code: "rm-open", name: "Open", locksAt: new Date(now.getTime() + 86_400_000), status: "OPEN" } });
    const locked = await db.competition.create({ data: { ...base, code: "rm-locked", name: "Locked", locksAt: new Date(now.getTime() - 1000), status: "LOCKED" } });
    expect(await removeCompetition(admin.userId, open.id)).toBe(0);
    expect(await db.competition.count({ where: { id: open.id } })).toBe(0);
    await expect(removeCompetition(admin.userId, locked.id)).rejects.toMatchObject({ code: "LOCKED" });
  });
});
