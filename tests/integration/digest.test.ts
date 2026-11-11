import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { checkDigestToken, digestToken, sendWeeklyDigests } from "@/server/digest";
import { buildWorld, makeTrader, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

// Friday 13 Nov 2026, 12:00 UK (GMT).
const FRIDAY_NOON = new Date("2026-11-13T12:00:00Z");

describe("friday digest", () => {
  it("only sends on Friday from 11:00 UK", async () => {
    expect(await sendWeeklyDigests(new Date("2026-11-12T12:00:00Z"))).toMatchObject({ skipped: expect.any(String) });
    expect(await sendWeeklyDigests(new Date("2026-11-13T10:30:00Z"))).toMatchObject({ skipped: expect.any(String) });
  });

  it("sends once per manager, skips opted-out, unverified and inactive managers", async () => {
    const a = await makeTrader("digesta");
    const off = await makeTrader("digestoff");
    const unverified = await makeUser("digestunv");
    const away = await makeTrader("digestaway");
    await db.user.updateMany({ where: { id: { in: [a.userId, off.userId, unverified.userId] } }, data: { lastSeenAt: FRIDAY_NOON } });
    await db.user.update({ where: { id: off.userId }, data: { weeklyDigest: false } });
    await db.user.update({ where: { id: away.userId }, data: { lastSeenAt: new Date(FRIDAY_NOON.getTime() - 90 * 86_400_000) } });

    const r1 = await sendWeeklyDigests(FRIDAY_NOON);
    expect(r1).toMatchObject({ remaining: 0 });
    const logs = await db.emailLog.findMany({ where: { template: "weeklyDigest" } });
    expect(logs.map((l) => l.userId)).toEqual([a.userId]);
    // Run again in the same Friday: nothing new.
    expect(await sendWeeklyDigests(new Date(FRIDAY_NOON.getTime() + 600_000))).toMatchObject({ skipped: "already sent" });
    expect(await db.emailLog.count({ where: { template: "weeklyDigest" } })).toBe(1);
  });

  it("signs unsubscribe links per manager", async () => {
    const a = await makeUser("digestsig");
    const b = await makeUser("digestsig2");
    expect(checkDigestToken(a.userId, digestToken(a.userId))).toBe(true);
    expect(checkDigestToken(b.userId, digestToken(a.userId))).toBe(false);
    expect(checkDigestToken(a.userId, "nope")).toBe(false);
  });
});
