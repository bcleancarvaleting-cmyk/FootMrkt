import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { appMessages, createAppGiveaway } from "@/server/app-messages";
import { balancesFor } from "@/server/wallet";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("app messages", () => {
  it("welcomes app installers after an hour, once", async () => {
    const now = new Date("2026-11-12T15:00:00Z");
    const a = await makeUser("appnew");
    const b = await makeUser("appjust");
    await db.user.update({ where: { id: a.userId }, data: { appInstalledAt: new Date(now.getTime() - 90 * 60_000) } });
    await db.user.update({ where: { id: b.userId }, data: { appInstalledAt: new Date(now.getTime() - 10 * 60_000) } });
    await appMessages(now);
    await appMessages(now);
    expect(await db.notification.count({ where: { userId: a.userId, kind: "APP" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: b.userId, kind: "APP" } })).toBe(0);
  });

  it("tells app users the hour before Tuesday's 9am booster drop", async () => {
    const a = await makeUser("appboost");
    await db.user.update({ where: { id: a.userId }, data: { appInstalledAt: new Date("2026-11-01T10:00:00Z"), lastSeenAt: new Date("2026-11-16T10:00:00Z") } });
    // Tuesday 17 Nov 2026, 8:20 UK (GMT).
    const r = await appMessages(new Date("2026-11-17T08:20:00Z"));
    expect(r.boosterSoon).toBe(1);
    expect((await appMessages(new Date("2026-11-17T07:00:00Z"))).boosterSoon).toBe(0);
  });

  it("app-user giveaways reach installers once, and new installers while open", async () => {
    const admin = await makeUser("appadmin");
    const a = await makeUser("appuser");
    const web = await makeUser("webonly");
    await db.user.update({ where: { id: a.userId }, data: { appInstalledAt: new Date() } });
    const g = await createAppGiveaway(admin.userId, { title: "App treat", message: "Thanks for installing", packSku: "football-gold-pick", mxMinor: 200, openDays: 3 });
    expect(g.sent).toBe(1);
    expect((await balancesFor(a.userId)).bonus).toBe(200);
    expect(await db.packEntitlement.count({ where: { userId: a.userId, sourceRef: `app-gift:${g.id}:${a.userId}` } })).toBe(1);
    expect((await balancesFor(web.userId)).bonus).toBe(0);
    // A web user installs later: the job delivers it to them, once.
    await db.user.update({ where: { id: web.userId }, data: { appInstalledAt: new Date() } });
    expect((await appMessages()).giveaways).toBe(1);
    expect((await appMessages()).giveaways).toBe(0);
    expect((await balancesFor(web.userId)).bonus).toBe(200);
  });
});
