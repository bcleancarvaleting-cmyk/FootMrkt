import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createGameweek } from "@/server/gameweeks";
import { markMomentShown, nextMoment } from "@/server/moments";
import { weeklyRhythm } from "@/server/rhythm";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("moments", () => {
  it("a match win and a personal best each get one celebration, shown once", async () => {
    const now = new Date();
    const old = await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000), actorId: null });
    const gw = await createGameweek({ season: "T", number: 2, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 7200_000), actorId: null });
    const [c1] = await db.competition.findMany({ where: { gameweekId: old.id }, take: 1 });
    const [c2] = await db.competition.findMany({ where: { gameweekId: gw.id }, take: 1 });
    await db.competition.updateMany({ where: { id: { in: [c1.id, c2.id] } }, data: { status: "SETTLED" } });
    await db.gameweek.updateMany({ where: { id: { in: [old.id, gw.id] } }, data: { status: "SETTLED", endsAt: now } });
    const [a, b, c] = [await makeUser("momenta"), await makeUser("momentb"), await makeUser("momentc")];
    await db.competitionEntry.create({ data: { userId: a.userId, competitionId: c1.id, formation: "2-2-2", finalPoints: 30, rank: 1 } });
    for (const [u, pts, rank] of [[a, 62, 1], [b, 50, 2], [c, 40, 3]] as const) {
      await db.competitionEntry.create({ data: { userId: u.userId, competitionId: c2.id, formation: "2-2-2", finalPoints: pts, rank } });
    }
    await weeklyRhythm(now);
    await weeklyRhythm(now);
    const mine = await db.moment.findMany({ where: { userId: a.userId }, orderBy: { kind: "asc" } });
    expect(mine.map((m) => m.kind).sort()).toEqual(["pb", "win"]);
    expect(await db.moment.count({ where: { userId: c.userId, kind: "podium" } })).toBe(1);

    const first = await nextMoment(a.userId);
    expect(first).not.toBeNull();
    await markMomentShown(a.userId, first!.id);
    await markMomentShown(b.userId, (await nextMoment(a.userId))!.id); // someone else can't dismiss it
    expect(await nextMoment(a.userId)).not.toBeNull();
    await markMomentShown(a.userId, (await nextMoment(a.userId))!.id);
    expect(await nextMoment(a.userId)).toBeNull();
  });
});
