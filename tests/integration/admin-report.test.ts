import { beforeEach, describe, expect, it } from "vitest";
import { dailyReport, reportRecipients, sendDailyReport, ukMidnight } from "@/server/admin-report";
import { db } from "@/server/db";
import { setText } from "@/server/settings";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("daily admin report", () => {
  it("counts yesterday's sign-ups, card takings, packs and players sold, and emails admins once from 8am", async () => {
    // Thu 12 Nov 2026 (UK = GMT); the report on Fri 13th covers Thursday.
    const thu = new Date("2026-11-12T00:00:00Z");
    const fri9am = new Date("2026-11-13T09:00:00Z");
    expect(ukMidnight(new Date("2026-11-12T15:00:00Z")).toISOString()).toBe(thu.toISOString());
    const admin = await makeUser("reportadmin");
    await db.user.update({ where: { id: admin.userId }, data: { role: "ADMIN", createdAt: new Date("2026-11-01T10:00:00Z") } });
    const u = await makeUser("reportfan");
    await db.user.update({ where: { id: u.userId }, data: { createdAt: new Date("2026-11-12T10:00:00Z") } });
    const at = new Date("2026-11-12T12:00:00Z");
    const order = (n: number, kind: "PACK_PURCHASE" | "DEPOSIT", amount: number, provider = "stripe") =>
      db.order.create({ data: { userId: u.userId, kind, refId: "x", amountMinor: amount, status: "PAID", provider, idempotencyKey: `r${n}`, createdAt: at, updatedAt: at } });
    await order(1, "PACK_PURCHASE", 299);
    await order(2, "DEPOSIT", 999);
    await order(3, "DEPOSIT", 5000, "sandbox"); // test payment: not counted
    const card = await db.cardInstance.findFirstOrThrow({ where: { supplyState: "AVAILABLE" } });
    await db.marketListing.create({ data: { cardId: card.id, house: true, askingPriceMinor: 450, status: "SOLD", soldPriceMinor: 450, soldAt: at, buyerId: u.userId, expiresAt: at } });

    const r = await dailyReport(thu, new Date("2026-11-13T00:00:00Z"));
    expect(r).toMatchObject({ revenueMinor: 1298, revenue: "£12.98", signups: 1, cardPacks: { count: 1 }, topUps: { count: 1 }, marketSold: { count: 1, total: "£4.50" } });
    expect(r.signupList[0]).toContain("reportfan");

    await setText(admin.userId, "reportEmails", "ian@example.com");
    expect(await reportRecipients()).toEqual(["reportadmin@test.dev", "ian@example.com"]);
    expect(await sendDailyReport(new Date("2026-11-13T07:30:00Z"))).toEqual({ skipped: "before 8am" });
    expect(await sendDailyReport(fri9am)).toEqual({ sent: 2 });
    expect(await sendDailyReport(new Date("2026-11-13T10:00:00Z"))).toEqual({ skipped: "sent" });
    expect(await db.emailLog.count({ where: { template: "adminDaily" } })).toBe(2);
  });
});
