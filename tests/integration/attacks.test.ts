import { beforeEach, describe, expect, it } from "vitest";
import { addToBasket, removeFromBasket } from "@/server/basket";
import { db, withTx } from "@/server/db";
import { handlePaymentWebhook } from "@/server/market";
import { acceptNotification, notify } from "@/server/notifications";
import { grantPack, openPack } from "@/server/packs";
import { signSandbox } from "@/server/payments/provider";
import { scheduleDrops } from "@/server/player-drops";
import { buyNow, createListing, makeOffer } from "@/server/transfers";
import { balancesFor, convertXp, credit, creditXp, requestWithdrawal } from "@/server/wallet";
import { buildWorld, makeTrader, makeUser, resetDb } from "./fixtures";

/**
 * Security & safety sweep (11 Nov 2026): the money and ownership paths under hostile use —
 * simultaneous double-taps, replays, other people's ids, and silly amounts. Each must leave the
 * books balanced: nothing paid twice, nothing given twice, nothing taken from someone else.
 */
beforeEach(async () => {
  await resetDb();
  await buildWorld();
  process.env.LEGAL_GATES_CLEARED = "MARKET,PAID_PACKS,DEPOSITS,WITHDRAWALS";
  process.env.FLAG_MARKET = "true";
  process.env.FLAG_PAID_PACKS = "true";
  process.env.FLAG_PACK_SHOP = "true";
  process.env.FLAG_WITHDRAWALS = "true";
});

const fund = (userId: string, minor: number, ref: string) => withTx((tx) => credit(tx, { userId, amountMinor: minor, kind: "DEPOSIT", bucket: "CASH", refId: ref }));

describe("simultaneous double-taps", () => {
  it("one MATCHX drop, five buyers at once: exactly one signs it and pays once", async () => {
    const tpl = await db.cardTemplate.findFirstOrThrow({ where: { category: "BRONZE", active: true, edition: "STANDARD" } });
    await scheduleDrops(null, [{ playerId: tpl.playerId, priceMinor: 300, liveAt: new Date(Date.now() - 1000) }]);
    const drop = await db.marketListing.findFirstOrThrow({ where: { house: true } });
    const buyers = await Promise.all([1, 2, 3, 4, 5].map((i) => makeTrader(`racer${i}`)));
    for (const b of buyers) await fund(b.userId, 1000, `race-fund-${b.userId}`);
    const results = await Promise.allSettled(buyers.map((b) => buyNow(b.userId, drop.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const spent = await Promise.all(buyers.map(async (b) => 1000 - (await balancesFor(b.userId)).total));
    expect(spent.filter((s) => s === 300)).toHaveLength(1);
    expect(spent.filter((s) => s === 0)).toHaveLength(4);
    expect((await db.marketListing.findUniqueOrThrow({ where: { id: drop.id } })).status).toBe("SOLD");
  });

  it("the same pack opened five times at once gives one set of cards", async () => {
    const u = await makeUser("tapper");
    const ent = await withTx((tx) => grantPack(tx, { userId: u.userId, skuCode: "football-bronze", source: "DEV", sourceRef: "race-pack" }));
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => openPack(u.userId, ent.id)));
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof openPack>>> => r.status === "fulfilled").map((r) => r.value);
    expect(new Set(ok.map((r) => r.openingId)).size).toBe(1);
    expect(await db.packOpening.count({ where: { entitlementId: ent.id } })).toBe(1);
    const opening = await db.packOpening.findFirstOrThrow({ where: { entitlementId: ent.id }, include: { _count: { select: { cards: true } } } });
    expect(opening._count.cards).toBe(ok[0].cards.length);
  });

  it("swapping XP ten times at once never spends XP that isn't there", async () => {
    const u = await makeUser("xpracer");
    const { xpPerMx } = await import("@/server/wallet");
    const rate = await xpPerMx();
    await withTx((tx) => creditXp(tx, { userId: u.userId, xp: rate * 2, refId: "xp-race", note: "test" }));
    await Promise.allSettled(Array.from({ length: 10 }, () => convertXp(u.userId, rate)));
    const bal = await balancesFor(u.userId);
    expect(bal.xp).toBeGreaterThanOrEqual(0);
    expect(bal.earned).toBeLessThanOrEqual(200); // at most the 2 MX that 2× the rate allows
  });

  it("a card payment's webhook replayed five times at once fulfils the order once", async () => {
    const { startPackPurchase } = await import("@/server/market");
    const u = await makeUser("payer");
    await db.user.update({ where: { id: u.userId }, data: { dateOfBirth: new Date("1990-01-01") } });
    const sku = await db.packSku.findFirstOrThrow({ where: { kind: "REGULAR", priceMinor: { gt: 0 }, code: "football-eng-bronze" } }).catch(() => db.packSku.findFirstOrThrow({ where: { kind: "REGULAR", priceMinor: { gt: 0 } } }));
    const { orderId } = await startPackPurchase(u.userId, sku.code, "race-order");
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    const body = JSON.stringify({ providerEventId: "evt-race", type: "payment.succeeded", providerRef: order.providerRef, amountMinor: order.amountMinor, currency: order.currency });
    await Promise.allSettled([1, 2, 3, 4, 5].map(() => handlePaymentWebhook(body, signSandbox(body))));
    expect(await db.packEntitlement.count({ where: { sourceRef: `order:${orderId}` } })).toBe(1);
    // A forged webhook (wrong signature) is refused outright.
    await expect(handlePaymentWebhook(body.replace("evt-race", "evt-forged"), "deadbeef")).rejects.toThrow(/signature/i);
  });
});

describe("other people's things", () => {
  it("can't open, list, offer on or un-basket someone else's cards or packs", async () => {
    const owner = await makeTrader("owner");
    const thief = await makeTrader("thief");
    const ent = await withTx((tx) => grantPack(tx, { userId: owner.userId, skuCode: "football-bronze", source: "DEV", sourceRef: "own-pack" }));
    await expect(openPack(thief.userId, ent.id)).rejects.toMatchObject({ code: "NO_PACK" });
    const { cards } = await openPack(owner.userId, ent.id);
    await expect(createListing(thief.userId, { cardId: cards[0].cardId, askingPriceMinor: 100 })).rejects.toThrow();
    const listing = await createListing(owner.userId, { cardId: cards[0].cardId, askingPriceMinor: 500 });
    await expect(buyNow(owner.userId, listing.id)).rejects.toMatchObject({ code: "OWN_LISTING" });
    await expect(makeOffer(owner.userId, listing.id, 100)).rejects.toMatchObject({ code: "OWN_LISTING" });
    // Someone else's notification and basket item can't be touched.
    await notify(owner.userId, { kind: "TEST", title: "mine", body: "x", dedupeKey: "mine-1" });
    const n = await db.notification.findFirstOrThrow({ where: { dedupeKey: "mine-1" } });
    await acceptNotification(thief.userId, n.id);
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).toBeNull();
    const tpl = await db.cardTemplate.findFirstOrThrow({ where: { category: "SILVER", active: true, edition: "STANDARD" } });
    await scheduleDrops(null, [{ playerId: tpl.playerId, priceMinor: 200, liveAt: new Date(Date.now() - 1000) }]);
    const drop = await db.marketListing.findFirstOrThrow({ where: { house: true } });
    await addToBasket(owner.userId, drop.id);
    await removeFromBasket(thief.userId, drop.id);
    expect(await db.basketItem.count({ where: { userId: owner.userId } })).toBe(1);
  });
});

describe("silly amounts", () => {
  it("negative, zero, fractional and huge amounts are refused", async () => {
    const u = await makeTrader("silly");
    await fund(u.userId, 1000, "silly-fund");
    const ent = await withTx((tx) => grantPack(tx, { userId: u.userId, skuCode: "football-bronze", source: "DEV", sourceRef: "silly-pack" }));
    const { cards } = await openPack(u.userId, ent.id);
    for (const price of [-100, 0, 10.5, 1e12]) {
      await expect(createListing(u.userId, { cardId: cards[0].cardId, askingPriceMinor: price })).rejects.toThrow();
    }
    await expect(convertXp(u.userId, -500)).rejects.toThrow();
    await expect(requestWithdrawal(u.userId, -1000)).rejects.toThrow();
    await expect(requestWithdrawal(u.userId, 10.5)).rejects.toThrow();
    expect((await balancesFor(u.userId)).total).toBe(1000);
  });
});

describe("counter-offers", () => {
  it("seller counters between offer and asking; buyer accepts (pays the counter) or declines (MX back); nobody else can answer", async () => {
    const { counterOffer, answerCounter } = await import("@/server/transfers");
    const seller = await makeTrader("cseller");
    const buyer = await makeTrader("cbuyer");
    const other = await makeTrader("cother");
    for (const u of [buyer, other]) await withTx((tx) => credit(tx, { userId: u.userId, amountMinor: 2000, kind: "CHALLENGE_REWARD", bucket: "BONUS", refId: `c-fund-${u.userId}` }));
    const ent = await withTx((tx) => grantPack(tx, { userId: seller.userId, skuCode: "football-bronze", source: "DEV", sourceRef: "c-pack" }));
    const { cards } = await openPack(seller.userId, ent.id);
    const listing = await createListing(seller.userId, { cardId: cards[0].cardId, askingPriceMinor: 1000 });
    const offer = await makeOffer(buyer.userId, listing.id, 500);
    await expect(counterOffer(seller.userId, offer.id, 400)).rejects.toMatchObject({ code: "TOO_LOW" });
    await expect(counterOffer(seller.userId, offer.id, 1000)).rejects.toMatchObject({ code: "TOO_HIGH" });
    await expect(counterOffer(other.userId, offer.id, 800)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await counterOffer(seller.userId, offer.id, 800);
    await expect(counterOffer(seller.userId, offer.id, 700)).rejects.toMatchObject({ code: "DONE" });
    await expect(answerCounter(other.userId, offer.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await balancesFor(buyer.userId)).total).toBe(1500); // the 5.00 offer still held
    await answerCounter(buyer.userId, offer.id, true);
    expect((await balancesFor(buyer.userId)).total).toBe(1200); // paid 8.00 in total
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: cards[0].cardId } })).ownerId).toBe(buyer.userId);
    expect((await db.marketListing.findUniqueOrThrow({ where: { id: listing.id } })).soldPriceMinor).toBe(800);
    await expect(answerCounter(buyer.userId, offer.id, true)).rejects.toMatchObject({ code: "DONE" });

    // Declining a counter gives the held MX back.
    const listing2 = await createListing(buyer.userId, { cardId: cards[0].cardId, askingPriceMinor: 1500 }).catch(() => null);
    if (listing2) {
      const o2 = await makeOffer(other.userId, listing2.id, 600);
      await counterOffer(buyer.userId, o2.id, 900);
      await answerCounter(other.userId, o2.id, false);
      expect((await balancesFor(other.userId)).total).toBe(2000);
      expect((await db.marketListing.findUniqueOrThrow({ where: { id: listing2.id } })).status).toBe("ACTIVE");
    }
  });
});
