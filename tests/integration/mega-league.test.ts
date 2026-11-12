import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createGameweek } from "@/server/gameweeks";
import { megaLeague } from "@/server/mega-league";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("mega league", () => {
  it("adds up each manager's best score per gameweek over the season, live for the current one", async () => {
    const now = new Date();
    const gw1 = await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000), actorId: null });
    const gw2 = await createGameweek({ season: "T", number: 2, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 7200_000), actorId: null });
    const comps1 = await db.competition.findMany({ where: { gameweekId: gw1.id }, take: 2 });
    const comps2 = await db.competition.findMany({ where: { gameweekId: gw2.id }, take: 1 });
    await db.competition.updateMany({ where: { id: { in: comps1.map((c) => c.id) } }, data: { status: "SETTLED" } });
    await db.competition.updateMany({ where: { id: { in: comps2.map((c) => c.id) } }, data: { status: "PROVISIONAL" } });
    await db.gameweek.update({ where: { id: gw1.id }, data: { status: "SETTLED" } });
    await db.gameweek.update({ where: { id: gw2.id }, data: { status: "PROVISIONAL" } });
    const a = await makeUser("megaa");
    const b = await makeUser("megab");
    const entry = (userId: string, competitionId: string, pts: { finalPoints?: number; provisionalPoints?: number }) => db.competitionEntry.create({ data: { userId, competitionId, formation: "2-2-2", ...pts } });
    // A enters two GW1 matches: only the best (40) counts. Then 10 live in GW2.
    await entry(a.userId, comps1[0].id, { finalPoints: 40 });
    await entry(a.userId, comps1[1].id, { finalPoints: 25 });
    await entry(a.userId, comps2[0].id, { provisionalPoints: 10 });
    await entry(b.userId, comps1[0].id, { finalPoints: 45 });
    const t = await megaLeague(a.userId);
    expect(t).toMatchObject({ season: "T", gameweek: 2, live: true, managers: 2 });
    expect(t.rows.map((r) => [r.name, r.total, r.rank])).toEqual([["megaa", 50, 1], ["megab", 45, 2]]);
    expect(t.me).toMatchObject({ rank: 1, gw: 10, played: 2, best: 40 });
  });
});
