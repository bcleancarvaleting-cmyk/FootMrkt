import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createGameweek } from "@/server/gameweeks";
import { createLeague, joinLeague, leagueTable, leaveLeague, myLeagues } from "@/server/leagues";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("mini-leagues", () => {
  it("create, join by code, table from each manager's best gameweek score, members only", async () => {
    const a = await makeUser("alpha");
    const b = await makeUser("bravo");
    const c = await makeUser("charlie");
    const league = await createLeague(a.userId, "Sunday Five");
    expect(league.code).toMatch(/^[A-Z2-9]{6}$/);
    await joinLeague(b.userId, league.code.toLowerCase());
    await joinLeague(b.userId, league.code); // joining twice is harmless
    await expect(joinLeague(c.userId, "ZZZZZZ")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(leagueTable(c.userId, league.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Scores: alpha has two entries in GW1 (best counts), bravo one.
    const now = new Date();
    const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000), actorId: null });
    const comps = await db.competition.findMany({ where: { gameweekId: gw.id }, take: 2 });
    await db.competitionEntry.createMany({
      data: [
        { competitionId: comps[0].id, userId: a.userId, formation: "2-2-2", finalPoints: 30 },
        { competitionId: comps[1].id, userId: a.userId, formation: "2-2-2", finalPoints: 45 },
        { competitionId: comps[0].id, userId: b.userId, formation: "2-2-2", finalPoints: 50 },
      ],
    });
    await db.competition.updateMany({ where: { id: { in: comps.map((x) => x.id) } }, data: { status: "SETTLED" } });
    await db.gameweek.update({ where: { id: gw.id }, data: { status: "SETTLED" } });

    const t = await leagueTable(a.userId, league.id);
    expect(t.rows.map((r) => [r.name, r.total, r.rank])).toEqual([
      ["bravo", 50, 1],
      ["alpha", 45, 2],
    ]);
    expect((await myLeagues(a.userId))[0]).toMatchObject({ name: "Sunday Five", members: 2, rank: 2 });

    await expect(leaveLeague(a.userId, league.id)).rejects.toMatchObject({ code: "OWNER" });
    await leaveLeague(b.userId, league.id);
    expect((await leagueTable(a.userId, league.id)).rows).toHaveLength(1);
  });
});
