import { beforeEach, describe, expect, it } from "vitest";
import { MX_BUNDLES, bonusPct, bundleForShortfall } from "@/config/bundles";
import { addToBasket, basketView, checkoutBasket } from "@/server/basket";
import { db, withTx } from "@/server/db";
import { handlePaymentWebhook } from "@/server/market";
import { signSandbox } from "@/server/payments/provider";
import { scheduleDrops } from "@/server/player-drops";
import { balancesFor, credit, startDeposit } from "@/server/wallet";
import { buildWorld, makeTrader, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
  process.env.LEGAL_GATES_CLEARED = "MARKET,PAID_PACKS,DEPOSITS";
  process.env.FLAG_MARKET = "true";
  process.env.FLAG_DEPOSITS = "true";
});

async function drops(n: number, priceMinor: number) {
  const tpls = await db.cardTemplate.findMany({ where: { category: "BRONZE", active: true, edition: "STANDARD" }, take: n });
  await scheduleDrops(null, tpls.map((t) => ({ playerId: t.playerId, priceMinor, liveAt: new Date(Date.now() - 1000) })));
  return db.marketListing.findMany({ where: { house: true, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

async function pay(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const body = JSON.stringify({ providerEventId: `evt-${orderId}`, type: "payment.succeeded", providerRef: order.providerRef, amountMinor: order.amountMinor, currency: order.currency });
  return handlePaymentWebhook(body, signSandbox(body));
}

describe("MX bundles", () => {
  it("four bundles, each better value than the last; the biggest is marked best value", () => {
    expect(MX_BUNDLES).toHaveLength(4);
    for (let i = 1; i < MX_BUNDLES.length; i++) expect(MX_BUNDLES[i].mxMinor / MX_BUNDLES[i].priceMinor).toBeGreaterThan(MX_BUNDLES[i - 1].mxMinor / MX_BUNDLES[i - 1].priceMinor);
    expect(MX_BUNDLES.filter((b) => b.best).map((b) => b.code)).toEqual([MX_BUNDLES[3].code]);
    expect(bonusPct(MX_BUNDLES[3])).toBe(25);
    expect(bundleForShortfall(300).code).toBe("starter");
    expect(bundleForShortfall(1050).code).toBe("squad");
    expect(bundleForShortfall(99_999).code).toBe("champion");
  });

  it("a paid bundle credits its MX (bonus included) exactly once", async () => {
    const u = await makeUser("topper");
    await db.user.update({ where: { id: u.userId }, data: { dateOfBirth: new Date("1990-01-01") } });
    const before = (await balancesFor(u.userId)).total;
    const { orderId } = await startDeposit(u.userId, { bundle: "champion", acceptTerms: true, acceptRisk: true }, "k1");
    const again = await startDeposit(u.userId, { bundle: "champion", acceptTerms: true, acceptRisk: true }, "k1");
    expect(again.orderId).toBe(orderId);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).amountMinor).toBe(3999);
    await pay(orderId);
    await pay(orderId);
    expect((await balancesFor(u.userId)).total - before).toBe(5000);
    await expect(startDeposit(u.userId, { bundle: "huge", acceptTerms: true, acceptRisk: true }, "k2")).rejects.toThrow();
  });
});

describe("drops basket", () => {
  it("add drops, see the total and shortfall, then pay for all at once; players are yours to play", async () => {
    const u = await makeTrader("shopper");
    const ls = await drops(3, 200);
    for (const l of ls) await addToBasket(u.userId, l.id);
    await addToBasket(u.userId, ls[0].id); // adding twice is harmless
    let v = await basketView(u.userId);
    expect(v.rows).toHaveLength(3);
    expect(v.totalMinor).toBe(600);
    const bal = (await balancesFor(u.userId)).total;
    expect(v.shortMinor).toBe(Math.max(0, 600 - bal));

    // Short of MX: nothing is bought.
    if (v.shortMinor > 0) {
      await expect(checkoutBasket(u.userId)).rejects.toMatchObject({ code: "NEED_MX" });
      expect(await db.marketListing.count({ where: { status: "SOLD" } })).toBe(0);
    }
    await withTx((tx) => credit(tx, { userId: u.userId, amountMinor: 1000, kind: "DEPOSIT", bucket: "CASH", refId: "topup-basket" }));

    // Someone else signs one first.
    const rival = await makeTrader("rival");
    await withTx((tx) => credit(tx, { userId: rival.userId, amountMinor: 1000, kind: "DEPOSIT", bucket: "CASH", refId: "topup-rival" }));
    await addToBasket(rival.userId, ls[1].id);
    expect((await checkoutBasket(rival.userId)).signed).toHaveLength(1);

    v = await basketView(u.userId);
    expect(v.rows).toHaveLength(2);
    expect(v.removed).toBe(1);
    const before = (await balancesFor(u.userId)).total;
    const r = await checkoutBasket(u.userId);
    expect(r.signed).toHaveLength(2);
    expect(before - (await balancesFor(u.userId)).total).toBe(400);
    expect(await db.basketItem.count({ where: { userId: u.userId } })).toBe(0);
    const owned = await db.cardInstance.findMany({ where: { ownerId: u.userId, id: { in: [ls[0].cardId, ls[2].cardId] } } });
    expect(owned).toHaveLength(2);
    expect(owned.every((c) => c.lock === "NONE")).toBe(true);
    await expect(checkoutBasket(u.userId)).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("only live MATCHX drops can go in a basket", async () => {
    const u = await makeTrader("picky");
    const tpl = await db.cardTemplate.findFirstOrThrow({ where: { category: "SILVER", active: true, edition: "STANDARD" } });
    await scheduleDrops(null, [{ playerId: tpl.playerId, priceMinor: 300, liveAt: new Date(Date.now() + 3_600_000) }]);
    const later = await db.marketListing.findFirstOrThrow({ where: { house: true } });
    await expect(addToBasket(u.userId, later.id)).rejects.toMatchObject({ code: "NOT_LIVE" });
    await expect(addToBasket(u.userId, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ code: "NOT_AVAILABLE" });
  });
});

describe("cashing out bought MX", () => {
  async function adultWithProfile(name: string) {
    const u = await makeUser(name);
    await db.user.update({ where: { id: u.userId }, data: { dateOfBirth: new Date("1990-01-01"), fullName: "Test Person", addressLine1: "1 Road", city: "Leeds", postcode: "LS1 1AA" } });
    return u;
  }

  it("only bought MX, only after 7 days, 10% fee; bonus MX stays in the game; reject returns it", async () => {
    process.env.LEGAL_GATES_CLEARED = "MARKET,PAID_PACKS,DEPOSITS,WITHDRAWALS";
    process.env.FLAG_WITHDRAWALS = "true";
    const { cashableMx, requestMxCashOut, processWithdrawal } = await import("@/server/wallet");
    const u = await adultWithProfile("casher");
    const admin = await makeUser("payer");
    const { orderId } = await startDeposit(u.userId, { bundle: "champion", acceptTerms: true, acceptRisk: true }, "c1");
    await pay(orderId);
    const bal = await balancesFor(u.userId);
    expect(bal.cash).toBe(3999); // what was paid
    expect(bal.earned).toBeGreaterThanOrEqual(1001); // the bonus, game-only
    // Just bought: held for 7 days.
    expect(await cashableMx(u.userId)).toBe(0);
    await expect(requestMxCashOut(u.userId, 1000)).rejects.toMatchObject({ code: "NOT_CASHABLE" });
    // A week later it's cashable — but never the bonus.
    const week = new Date(Date.now() + 8 * 86_400_000);
    expect(await cashableMx(u.userId, db, week)).toBe(3999);
    await expect(requestMxCashOut(u.userId, 4000, week)).rejects.toMatchObject({ code: "NOT_CASHABLE" });
    await expect(requestMxCashOut(u.userId, 500, week)).rejects.toMatchObject({ code: "MIN" });
    const w = await requestMxCashOut(u.userId, 2000, week);
    expect(w).toMatchObject({ amountMinor: 1800, feeMinor: 200, source: "MX" });
    expect((await balancesFor(u.userId)).cash).toBe(1999);
    await processWithdrawal(admin.userId, w.id, "REJECTED");
    expect((await balancesFor(u.userId)).cash).toBe(3999);
    // Spending uses earned MX first, so bought MX stays cashable for longest.
    const w2 = await requestMxCashOut(u.userId, 3999, week);
    expect(w2.amountMinor).toBe(3999 - 400);
    expect((await balancesFor(u.userId)).cash).toBe(0);
  });

  it("MX from sales, XP and rewards can never be cashed out", async () => {
    process.env.LEGAL_GATES_CLEARED = "MARKET,PAID_PACKS,DEPOSITS,WITHDRAWALS";
    process.env.FLAG_WITHDRAWALS = "true";
    const { cashableMx } = await import("@/server/wallet");
    const u = await adultWithProfile("earner");
    await withTx((tx) => credit(tx, { userId: u.userId, amountMinor: 5000, kind: "MARKET_SALE", bucket: "BONUS", refId: "sale-x" }));
    expect(await cashableMx(u.userId, db, new Date(Date.now() + 30 * 86_400_000))).toBe(0);
  });
});
