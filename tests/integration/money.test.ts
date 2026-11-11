import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { moneyDashboard } from "@/server/money";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("admin money dashboard", () => {
  it("counts real Stripe takings only, by window, with refunds and test payments apart", async () => {
    const { userId } = await makeUser("payer");
    const order = (n: number, d: Partial<{ provider: string; status: "PAID" | "REFUNDED"; kind: "PACK_PURCHASE" | "DEPOSIT"; daysAgo: number; amount: number }>) =>
      db.order.create({
        data: { userId, kind: d.kind ?? "PACK_PURCHASE", refId: "x", amountMinor: d.amount ?? 500, status: d.status ?? "PAID", provider: d.provider ?? "stripe", idempotencyKey: `k${n}`, createdAt: new Date(Date.now() - (d.daysAgo ?? 0) * 86_400_000) },
      });
    await order(1, {});
    await order(2, { kind: "DEPOSIT", amount: 1000, daysAgo: 3 });
    await order(3, { daysAgo: 40 });
    await order(4, { status: "REFUNDED", amount: 300 });
    await order(5, { provider: "sandbox", amount: 9999 });
    const m = await moneyDashboard();
    const [day, week, month, all] = m.card;
    expect(day).toMatchObject({ paidMinor: 500, payments: 1, refundedMinor: 300 });
    expect(week).toMatchObject({ paidMinor: 1500, packsMinor: 500, bundlesMinor: 1000 });
    expect(month.paidMinor).toBe(1500);
    expect(all.paidMinor).toBe(2000);
    expect(m.test).toEqual({ minor: 9999, count: 1 });
    expect(m.daily.reduce((s, d) => s + d.value, 0)).toBe(15);
    expect(m.spenders[0]).toMatchObject({ userId, minor: 1500, payments: 2 });
  });
});
