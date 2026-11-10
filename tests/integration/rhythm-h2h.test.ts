import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createGameweek } from "@/server/gameweeks";
import { challenge, respond, settleH2H } from "@/server/h2h";
import { weeklyRhythm } from "@/server/rhythm";
import { balancesFor } from "@/server/wallet";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

async function openGameweek(hoursToKickoff: number) {
  const now = Date.now();
  return createGameweek({ season: "T", number: 1, opensAt: new Date(now - 1000), firstKickoffAt: new Date(now + hoursToKickoff * 3600_000), actorId: null });
}

describe("weekly rhythm", () => {
  it("reminds recent managers who haven't entered, once, a day before the deadline", async () => {
    await openGameweek(12);
    const a = await makeUser();
    const b = await makeUser();
    await db.user.updateMany({ where: { id: { in: [a.userId, b.userId] } }, data: { lastSeenAt: new Date() } });
    await db.user.update({ where: { id: b.userId }, data: { lastSeenAt: new Date(Date.now() - 60 * 86_400_000) } });
    const r1 = await weeklyRhythm();
    const r2 = await weeklyRhythm();
    expect(r1.reminded24h).toBe(1);
    expect(r2.reminded24h).toBe(1); // attempted again, but the dedupe key stops a second message
    expect(await db.notification.count({ where: { userId: a.userId, kind: "DEADLINE" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: b.userId } })).toBe(0);
  });
});

describe("head-to-head", () => {
  it("challenge → accept → settle: the higher best score wins bonus XP", async () => {
    const gw = await openGameweek(48);
    const a = await makeUser("alpha");
    const b = await makeUser("bravo");
    const c = await challenge(a.userId, "BRAVO");
    await expect(challenge(a.userId, "bravo")).rejects.toThrow(/already challenged/);
    await expect(challenge(b.userId, "alpha")).rejects.toThrow(/already challenged you/);
    await respond(b.userId, c.id, true);

    // Pretend the gameweek was played and settled.
    const comp = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id } });
    await db.competition.update({ where: { id: comp.id }, data: { status: "SETTLED" } });
    await db.competitionEntry.createMany({
      data: [
        { competitionId: comp.id, userId: a.userId, formation: "2-2-2", finalPoints: 41, rank: 1 },
        { competitionId: comp.id, userId: b.userId, formation: "2-2-2", finalPoints: 30, rank: 2 },
      ],
    });
    await db.gameweek.update({ where: { id: gw.id }, data: { status: "SETTLED" } });
    const xpBefore = (await balancesFor(a.userId)).xp;
    expect((await settleH2H()).settled).toBe(1);
    expect((await settleH2H()).settled).toBe(0);
    const done = await db.h2HChallenge.findUniqueOrThrow({ where: { id: c.id } });
    expect(done).toMatchObject({ status: "SETTLED", winnerId: a.userId, challengerPoints: 41, opponentPoints: 30 });
    expect((await balancesFor(a.userId)).xp - xpBefore).toBe(50);
  });

  it("unanswered challenges expire once the gameweek locks", async () => {
    const gw = await openGameweek(48);
    const a = await makeUser();
    const b = await makeUser("charlie");
    await challenge(a.userId, "charlie");
    await db.competition.updateMany({ where: { gameweekId: gw.id }, data: { status: "LOCKED", locksAt: new Date(Date.now() - 1000) } });
    expect((await settleH2H()).expired).toBe(1);
    void b;
  });
});
