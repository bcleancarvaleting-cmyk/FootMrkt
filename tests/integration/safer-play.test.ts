import { beforeEach, describe, expect, it } from "vitest";
import { authenticate } from "@/server/auth/accounts";
import { db } from "@/server/db";
import { assertCanSpend, pauseAccount, setLimits } from "@/server/safer-play";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

async function paid(userId: string, amountMinor: number, daysAgo = 0) {
  await db.order.create({
    data: { userId, kind: "DEPOSIT", refId: "wallet", amountMinor, provider: "sandbox", status: "PAID", idempotencyKey: `t:${Math.random()}`, createdAt: new Date(Date.now() - daysAgo * 86_400_000) },
  });
}

describe("safer play", () => {
  it("blocks a payment that would go over a daily, weekly or monthly limit", async () => {
    const { userId } = await makeUser();
    await setLimits(userId, { daily: 2000, weekly: 5000, monthly: null });
    await paid(userId, 1500);
    await expect(assertCanSpend(userId, 1000)).rejects.toThrow(/today's spend limit/);
    await expect(assertCanSpend(userId, 500)).resolves.toBeUndefined();
  });

  it("applies a lower limit now but makes a higher one wait 24 hours", async () => {
    const { userId } = await makeUser();
    await setLimits(userId, { daily: 1000, weekly: null, monthly: null });
    const r = await setLimits(userId, { daily: 5000, weekly: null, monthly: null });
    expect(r.waits).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.limitDailyMinor).toBe(1000);
    expect(u.pendingLimitsAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    // Once the cooling-off has passed, the higher limit applies.
    await db.user.update({ where: { id: userId }, data: { pendingLimitsAt: new Date(Date.now() - 1000) } });
    await assertCanSpend(userId, 4000);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).limitDailyMinor).toBe(5000);
  });

  it("rejects limits out of order or out of range", async () => {
    const { userId } = await makeUser();
    await expect(setLimits(userId, { daily: 5000, weekly: 2000, monthly: null })).rejects.toThrow(/daily limit/);
    await expect(setLimits(userId, { daily: 100, weekly: null, monthly: null })).rejects.toThrow(/between £5/);
  });

  it("a break logs the player out, stops logins and blocks spending", async () => {
    const { userId } = await makeUser("breaktaker");
    await pauseAccount(userId, "timeout", "24h");
    expect(await db.session.count({ where: { userId } })).toBe(0);
    await expect(authenticate("breaktaker@test.dev", "correct-horse-battery")).rejects.toThrow(/taking a break/);
    await expect(assertCanSpend(userId, 100)).rejects.toThrow(/taking a break/);
  });

  it("self-exclusion stops logins and turns off marketing", async () => {
    const { userId } = await makeUser("excluded");
    await db.user.update({ where: { id: userId }, data: { marketingOptIn: true } });
    await pauseAccount(userId, "exclusion", "6m");
    await expect(authenticate("excluded@test.dev", "correct-horse-battery")).rejects.toThrow(/self-excluded/);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).marketingOptIn).toBe(false);
  });
});
