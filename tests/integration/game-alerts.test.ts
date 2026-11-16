import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { announceNewGames } from "@/server/game-alerts";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("New fixture alerts", () => {
  it("wait an hour after the newest game, then go out once — one game or a batch", async () => {
    const { userId } = await makeUser();
    const t0 = new Date("2026-11-16T10:00:00Z");
    expect(await announceNewGames(t0)).toEqual({ skipped: "first run" });
    const sport = await db.sport.findFirstOrThrow();
    const gw = await db.gameweek.create({ data: { sportId: sport.id, season: "2026-27", number: 90, startsAt: new Date("2026-11-21T15:00:00Z"), endsAt: new Date("2026-11-22T18:00:00Z") } });
    const mk = (name: string, at: Date) =>
      db.competition.create({ data: { sportId: sport.id, gameweekId: gw.id, code: name, name, format: "OPEN", rosterRules: "football-roster-v4", scoringRules: "football-scoring-v3-draft", rewards: {}, entryOpensAt: at, locksAt: new Date("2026-11-21T14:00:00Z"), status: "OPEN", createdAt: at } });
    await mk("Saturday Cup", new Date("2026-11-16T10:10:00Z"));
    await mk("Gold Cup", new Date("2026-11-16T10:40:00Z"));
    // Less than an hour since the newest: hold.
    expect(await announceNewGames(new Date("2026-11-16T11:20:00Z"))).toEqual({ waiting: 2 });
    const r = await announceNewGames(new Date("2026-11-16T11:41:00Z"));
    expect(r).toMatchObject({ games: 2 });
    const n = await db.notification.findMany({ where: { userId, kind: "NEW_GAMES" } });
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ title: "⚽ New fixtures added", href: "/matches" });
    // Nothing new: nothing sent again.
    expect(await announceNewGames(new Date("2026-11-16T13:00:00Z"))).toEqual({ sent: 0 });
  });
});
