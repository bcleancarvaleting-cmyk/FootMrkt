import { beforeEach, describe, expect, it } from "vitest";
import { announceGiftDrops, announceLeagueWinners } from "@/server/alerts";
import { db } from "@/server/db";
import { createGameweek } from "@/server/gameweeks";
import { createLeague, joinLeague } from "@/server/leagues";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

const titles = async (userId: string) => (await db.notification.findMany({ where: { userId } })).map((n) => n.title);

describe("phone / in-app alerts", () => {
  it("tells the top scorer in each mini-league they won the gameweek, once", async () => {
    const now = Date.now();
    const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now - 1000), firstKickoffAt: new Date(now + 3600_000), actorId: null });
    const [a, b, c] = [await makeUser("alpha"), await makeUser("bravo"), await makeUser("charlie")];
    const league = await createLeague(a.userId, "Office League");
    await joinLeague(b.userId, league.code);
    await joinLeague(c.userId, league.code); // c doesn't play this week
    const comp = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id } });
    await db.competition.update({ where: { id: comp.id }, data: { status: "SETTLED" } });
    await db.competitionEntry.createMany({
      data: [
        { competitionId: comp.id, userId: a.userId, formation: "2-2-2", finalPoints: 30, rank: 2 },
        { competitionId: comp.id, userId: b.userId, formation: "2-2-2", finalPoints: 44, rank: 1 },
      ],
    });
    await db.gameweek.update({ where: { id: gw.id }, data: { status: "SETTLED", endsAt: new Date() } });

    expect(await announceLeagueWinners()).toBe(1);
    await announceLeagueWinners();
    expect(await titles(b.userId)).toEqual(["🏆 You won GW1 in Office League"]);
    expect(await titles(a.userId)).toEqual([]);
    expect(await titles(c.userId)).toEqual([]);
  });

  it("announces a live gift drop to recent managers, once per drop", async () => {
    const recent = await makeUser("recent");
    const lapsed = await makeUser("lapsed");
    await db.user.update({ where: { id: recent.userId }, data: { lastSeenAt: new Date() } });
    await db.user.update({ where: { id: lapsed.userId }, data: { lastSeenAt: new Date(Date.now() - 60 * 86_400_000), createdAt: new Date(Date.now() - 90 * 86_400_000) } });
    await db.freePackDrop.create({ data: { title: "Weekend Gold", skuCode: "football-eng-gold", startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 24 * 3600_000) } });
    expect(await announceGiftDrops()).toBeGreaterThan(0);
    expect(await announceGiftDrops()).toBe(0);
    expect(await titles(recent.userId)).toEqual(["🎁 Free gift: Weekend Gold"]);
    expect(await titles(lapsed.userId)).toEqual([]);
  });
});
