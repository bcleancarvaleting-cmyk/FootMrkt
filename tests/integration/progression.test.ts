import { beforeEach, describe, expect, it } from "vitest";
import { levelFor } from "@/config/progression";
import { db, withTx } from "@/server/db";
import { createGameweek, simulateFixturesNow } from "@/server/gameweeks";
import { openPack } from "@/server/packs";
import { answerQuestion, resolvePredictions, todaysQuestion } from "@/server/predictions";
import { lifetimeXp, refreshProgress } from "@/server/progression";
import { touchStreak } from "@/server/streaks";
import { creditXp } from "@/server/wallet";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("levels", () => {
  it("levels by lifetime XP, with progress to the next", () => {
    expect(levelFor(0)).toMatchObject({ level: 1, name: "Sunday League" });
    expect(levelFor(650)).toMatchObject({ level: 4, name: "Non-League" });
    expect(levelFor(800).progress).toBeCloseTo((800 - 600) / 400);
    expect(levelFor(99_999)).toMatchObject({ level: 11, next: null, progress: 1 });
  });

  it("achievements pay XP once; level-ups grant a free pack once each", async () => {
    const u = await makeUser("climber");
    await openPack(u.userId, u.starterEntitlementId);
    const first = await refreshProgress(u.userId);
    expect(first.unlocked).toContain("first-pack");
    const xp1 = await lifetimeXp(u.userId);
    expect(xp1).toBeGreaterThanOrEqual(10);
    expect((await refreshProgress(u.userId)).unlocked).toEqual([]);
    expect(await lifetimeXp(u.userId)).toBe(xp1);

    await withTx((tx) => creditXp(tx, { userId: u.userId, xp: 700, refId: "test-xp", note: "test" }));
    const r = await refreshProgress(u.userId);
    expect(r.level.level).toBeGreaterThanOrEqual(4);
    expect(r.levels).toEqual([2, 3, 4]);
    expect(await db.packEntitlement.count({ where: { userId: u.userId, sourceRef: { startsWith: "level:" } } })).toBe(3);
    expect((await refreshProgress(u.userId)).levels).toEqual([]);
    expect(await db.notification.count({ where: { userId: u.userId, kind: "level" } })).toBe(3);
  });
});

describe("daily streak", () => {
  it("extends day by day, resets after a missed day, and pays a free pack every 7th day", async () => {
    const u = await makeUser("streaker");
    const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n, 12));
    expect((await touchStreak(u.userId, day(0))).streak).toBe(1);
    expect((await touchStreak(u.userId, day(0))).extended).toBe(false);
    for (let i = 1; i < 7; i++) await touchStreak(u.userId, day(i));
    const user = await db.user.findUniqueOrThrow({ where: { id: u.userId } });
    expect(user).toMatchObject({ loginStreak: 7, bestStreak: 7 });
    expect(await db.packEntitlement.count({ where: { userId: u.userId, sourceRef: { startsWith: "streak:" } } })).toBe(1);
    expect((await touchStreak(u.userId, day(9))).streak).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.userId } })).bestStreak).toBe(7);
  });
});

describe("daily prediction", () => {
  it("asks about a real upcoming match, locks at kick-off and pays XP for right answers", async () => {
    const now = new Date();
    const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000), actorId: null });
    const q = await todaysQuestion();
    expect(q).not.toBeNull();
    expect(await todaysQuestion()).toMatchObject({ id: q!.id });
    const yes = await makeUser("yesman");
    const no = await makeUser("noman");
    await answerQuestion(yes.userId, q!.id, true);
    await answerQuestion(no.userId, q!.id, false);
    await expect(answerQuestion(yes.userId, q!.id, true, new Date(q!.locksAt.getTime() + 1))).rejects.toMatchObject({ code: "LOCKED" });

    await simulateFixturesNow(gw.id, "all", null);
    await db.predictionQuestion.update({ where: { id: q!.id }, data: { locksAt: new Date(Date.now() - 1000) } });
    expect(await resolvePredictions()).toBe(1);
    const resolved = await db.predictionQuestion.findUniqueOrThrow({ where: { id: q!.id } });
    const winner = resolved.answer ? yes : no;
    expect(await db.predictionAnswer.findFirstOrThrow({ where: { userId: winner.userId } })).toMatchObject({ correct: true });
    expect(await lifetimeXp(winner.userId)).toBe(20);
    expect(await resolvePredictions()).toBe(0);
  });
});
