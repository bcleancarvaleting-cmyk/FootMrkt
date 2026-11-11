import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createGameweek, simulateFixturesNow } from "@/server/gameweeks";
import { currentTeamOfTheWeek, pickTeamOfTheWeek, totwPlayerIds } from "@/server/totw";
import { cardViews } from "@/server/views";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("team of the week", () => {
  it("picks 7 in shape after a gameweek settles, badges their cards for 7 days and tells owners once", async () => {
    const now = new Date();
    const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000), actorId: null });
    await simulateFixturesNow(gw.id, "all", null);
    expect((await pickTeamOfTheWeek()).picked).toEqual([]); // not settled yet
    await db.gameweek.update({ where: { id: gw.id }, data: { status: "SETTLED", endsAt: now } });

    // A manager owns a card of every player, so whoever is picked, they hear about it.
    const owner = await makeUser("totwowner");
    expect((await pickTeamOfTheWeek(now)).picked).toEqual([1]);
    expect((await pickTeamOfTheWeek(now)).picked).toEqual([]); // once only

    const t = await currentTeamOfTheWeek(now);
    expect(t?.players).toHaveLength(7);
    const pos = t!.players.map((p) => p.position);
    expect(pos.filter((p) => p === "GK").length).toBeLessThanOrEqual(1);
    for (let i = 1; i < t!.players.length; i++) expect(t!.players[i - 1].points).toBeGreaterThanOrEqual(t!.players[i].points);

    const ids = await totwPlayerIds(now);
    expect(ids.size).toBe(7);
    const owned = await cardViews({ ownerId: owner.userId, supplyState: "HELD" });
    expect(owned.filter((c) => c.totw).every((c) => ids.has(c.playerId))).toBe(true);
    const notes = await db.notification.count({ where: { userId: owner.userId, kind: "TOTW" } });
    expect(notes).toBe(owned.some((c) => ids.has(c.playerId)) ? 1 : 0);

    // The badge comes off after 7 days.
    const later = new Date(now.getTime() + 8 * 86_400_000);
    expect(await currentTeamOfTheWeek(later)).toBeNull();
    expect((await totwPlayerIds(later)).size).toBe(0);
  });
});
