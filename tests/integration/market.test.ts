import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db";
import { setFlag } from "@/server/flags";
import { handlePaymentWebhook, startPackPurchase } from "@/server/market";
import { grantPack, openPack } from "@/server/packs";
import { signSandbox } from "@/server/payments/provider";
import { supplyReport } from "@/server/supply";
import {
  buyNow,
  cancelAuction,
  cancelListing,
  createAuction,
  createListing,
  expireListings,
  bandPrice,
  clearHouseListings,
  feeFor,
  makeOffer,
  placeBid,
  recommendPrice,
  respondToOffer,
  settleAuctions,
  stockHouseListings,
  stockPinnedListings,
  withdrawOffer,
} from "@/server/transfers";
import { balancesFor, credit } from "@/server/wallet";
import { buildWorld, makeUser, resetDb } from "./fixtures";

const ENV = { ...process.env };
beforeEach(async () => {
  await resetDb();
  await buildWorld();
});
afterEach(() => {
  process.env = { ...ENV };
});

function enableLegalGates() {
  process.env.LEGAL_GATES_CLEARED = "MARKET,PAID_PACKS";
  process.env.FLAG_MARKET = "true";
  process.env.FLAG_PAID_PACKS = "true";
  process.env.FLAG_AUCTIONS = "true";
  process.env.FLAG_PACK_SHOP = "true";
}

async function pay(orderId: string, eventId = `evt-${orderId}`) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const body = JSON.stringify({ providerEventId: eventId, type: "payment.succeeded", providerRef: order.providerRef, amountMinor: order.amountMinor, currency: order.currency });
  return handlePaymentWebhook(body, signSandbox(body));
}

async function tradeableCard(userId: string) {
  const ent = await withTx((tx) => grantPack(tx, { userId, skuCode: "football-bronze", source: "DEV", sourceRef: `dev:${userId}:${Math.random()}` }));
  const res = await openPack(userId, ent.id);
  return res.cards[0].cardId;
}

/** Give a manager earned MX (what the Transfer list and auctions accept). */
const fund = (userId: string, minor: number, ref = "seed") => withTx((tx) => credit(tx, { userId, amountMinor: minor, kind: "CHALLENGE_REWARD", bucket: "BONUS", refId: `test:${userId}:${ref}` }));

describe("legal gate (spec §9.3, §17)", () => {
  it("transfers and paid packs are unavailable while the gate is closed, even if an env flag says on", async () => {
    process.env.FLAG_PACK_SHOP = "true";
    process.env.FLAG_MARKET = "true";
    process.env.FLAG_PAID_PACKS = "true";
    const { userId } = await makeUser();
    const card = await tradeableCard(userId);
    await expect(createListing(userId, { cardId: card, askingPriceMinor: 500 })).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await expect(startPackPurchase(userId, "football-bronze", "k")).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("an admin cannot switch a legal-gated flag on, and flag changes are audited", async () => {
    const { userId } = await makeUser();
    await expect(setFlag(userId, "MARKET", true)).rejects.toMatchObject({ code: "LEGAL_GATE" });
    await expect(setFlag(userId, "WITHDRAWALS", true)).rejects.toMatchObject({ code: "LEGAL_GATE" });
    await setFlag(userId, "DEV_TOOLS", false);
    expect(await db.adminAuditLog.count({ where: { action: "flag.set", entityId: "DEV_TOOLS" } })).toBe(1);
  });
});

describe("P2P transfers in MX", () => {
  it("locks listed cards, blocks untradeable, duplicate and over-100-MX listings", async () => {
    enableLegalGates();
    const { userId, starterEntitlementId } = await makeUser();
    const starter = await openPack(userId, starterEntitlementId);
    await expect(createListing(userId, { cardId: starter.cards[0].cardId, askingPriceMinor: 500 })).rejects.toMatchObject({ code: "NOT_TRADEABLE" });
    const card = await tradeableCard(userId);
    await expect(createListing(userId, { cardId: card, askingPriceMinor: 10_001 })).rejects.toThrow(/100 MX/);
    const listing = await createListing(userId, { cardId: card, askingPriceMinor: 500 });
    expect(listing.currency).toBe("MX");
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: card } })).lock).toBe("LISTED");
    await expect(createListing(userId, { cardId: card, askingPriceMinor: 600 })).rejects.toMatchObject({ code: "CARD_BUSY" });
    await cancelListing(userId, listing.id);
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: card } })).lock).toBe("NONE");
  });

  it("buy now moves the card, pays the seller minus 5%, and a card can't be sold twice", async () => {
    enableLegalGates();
    const seller = await makeUser("seller");
    const b1 = await makeUser("buyer1");
    const b2 = await makeUser("buyer2");
    await fund(b1.userId, 2000);
    await fund(b2.userId, 2000);
    const card = await tradeableCard(seller.userId);
    const listing = await createListing(seller.userId, { cardId: card, askingPriceMinor: 1000 });

    const results = await Promise.allSettled([buyNow(b1.userId, listing.id), buyNow(b2.userId, listing.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const winner = results[0].status === "fulfilled" ? b1.userId : b2.userId;
    const loser = winner === b1.userId ? b2.userId : b1.userId;

    const after = await db.cardInstance.findUniqueOrThrow({ where: { id: card } });
    expect(after.ownerId).toBe(winner);
    expect(after.lock).toBe("NONE");
    expect(feeFor(1000)).toBe(50);
    expect((await balancesFor(seller.userId)).earned).toBe(950);
    expect((await balancesFor(winner)).earned).toBe(1000);
    expect((await balancesFor(loser)).earned).toBe(2000);
    expect((await db.marketListing.findUniqueOrThrow({ where: { id: listing.id } })).feeMinor).toBe(50);
    expect((await supplyReport()).reconciled).toBe(true);
  });

  it("bought MX can't buy players (packs and entries only)", async () => {
    enableLegalGates();
    const seller = await makeUser("sss3");
    const buyer = await makeUser("bbb5");
    await withTx((tx) => credit(tx, { userId: buyer.userId, amountMinor: 5000, kind: "DEPOSIT", bucket: "CASH", refId: "bought-1" }));
    const listing = await createListing(seller.userId, { cardId: await tradeableCard(seller.userId), askingPriceMinor: 300 });
    await expect(buyNow(buyer.userId, listing.id)).rejects.toMatchObject({ code: "EARNED_ONLY" });
  });

  it("earned MX can buy cards (MX is never withdrawable), and sale proceeds are earned MX, not winnings", async () => {
    enableLegalGates();
    const seller = await makeUser("sss2");
    const buyer = await makeUser("bbb3");
    await withTx((tx) => credit(tx, { userId: buyer.userId, amountMinor: 500, kind: "CHALLENGE_REWARD", refId: "bonus-1" }));
    const listing = await createListing(seller.userId, { cardId: await tradeableCard(seller.userId), askingPriceMinor: 300 });
    await buyNow(buyer.userId, listing.id);
    expect(await balancesFor(buyer.userId)).toMatchObject({ bonus: 200, total: 200 });
    expect(await balancesFor(seller.userId)).toMatchObject({ total: 285, winnings: 0, withdrawable: 0 });
  });

  it("MATCHX listings: cards from circulation, buy now only, unsold cards return to packs", async () => {
    enableLegalGates();
    const admin = await makeUser("adm9");
    const buyer = await makeUser("bbb9");
    await fund(buyer.userId, 5000);
    const before = (await supplyReport()).availableInPool;
    expect(await stockHouseListings(admin.userId, { tier: "BRONZE", count: 3, priceMinor: 150 })).toBe(3);
    expect((await supplyReport()).availableInPool).toBe(before - 3);
    const listings = await db.marketListing.findMany({ where: { house: true, status: "ACTIVE" } });
    expect(listings).toHaveLength(3);
    await expect(makeOffer(buyer.userId, listings[0].id, 100)).rejects.toMatchObject({ code: "BUY_NOW_ONLY" });
    await buyNow(buyer.userId, listings[0].id);
    const card = await db.cardInstance.findUniqueOrThrow({ where: { id: listings[0].cardId } });
    expect(card).toMatchObject({ ownerId: buyer.userId, supplyState: "HELD", tradeStatus: "TRADEABLE" });
    expect((await balancesFor(buyer.userId)).total).toBe(4850);
    expect(await clearHouseListings(admin.userId)).toBe(2);
    expect((await supplyReport()).availableInPool).toBe(before - 1);
    expect((await supplyReport()).reconciled).toBe(true);
  });

  it("offers hold MX; declined / withdrawn / lapsed offers return it; accepting completes the sale", async () => {
    enableLegalGates();
    const seller = await makeUser("sss4");
    const a = await makeUser("aaa4");
    const b = await makeUser("bbb4");
    await fund(a.userId, 1000);
    await fund(b.userId, 1000);
    const listing = await createListing(seller.userId, { cardId: await tradeableCard(seller.userId), askingPriceMinor: 800 });
    await expect(makeOffer(a.userId, listing.id, 800)).rejects.toMatchObject({ code: "USE_BUY_NOW" });

    const oa = await makeOffer(a.userId, listing.id, 500);
    expect((await balancesFor(a.userId)).earned).toBe(500);
    const oa2 = await makeOffer(a.userId, listing.id, 600); // replaces the first
    expect((await balancesFor(a.userId)).earned).toBe(400);
    expect((await db.marketOffer.findUniqueOrThrow({ where: { id: oa.id } })).status).toBe("WITHDRAWN");

    const ob = await makeOffer(b.userId, listing.id, 550);
    await withdrawOffer(b.userId, ob.id);
    expect((await balancesFor(b.userId)).earned).toBe(1000);
    const ob2 = await makeOffer(b.userId, listing.id, 560);
    await respondToOffer(seller.userId, ob2.id, false);
    expect((await balancesFor(b.userId)).earned).toBe(1000);
    const ob3 = await makeOffer(b.userId, listing.id, 570);

    await respondToOffer(seller.userId, oa2.id, true);
    expect((await balancesFor(a.userId)).earned).toBe(400);
    expect((await balancesFor(seller.userId)).earned).toBe(600 - feeFor(600));
    expect((await balancesFor(b.userId)).earned).toBe(1000); // b's other offer lapsed and was returned
    expect((await db.marketOffer.findUniqueOrThrow({ where: { id: ob3.id } })).status).toBe("LAPSED");
    const card = await db.marketListing.findUniqueOrThrow({ where: { id: listing.id }, include: { card: true } });
    expect(card.card.ownerId).toBe(a.userId);
    expect(card.soldPriceMinor).toBe(600);
  });

  it("expiring a listing returns held offers", async () => {
    enableLegalGates();
    const seller = await makeUser("sss5");
    const a = await makeUser("aaa5");
    await fund(a.userId, 500);
    const listing = await createListing(seller.userId, { cardId: await tradeableCard(seller.userId), askingPriceMinor: 400, days: 1 });
    await makeOffer(a.userId, listing.id, 300);
    expect(await expireListings(new Date(Date.now() + 2 * 86_400_000))).toBe(1);
    expect((await balancesFor(a.userId)).earned).toBe(500);
  });

  it("recommends the valuation, blended with the average sale once there's enough history, within 0.10–100 MX", () => {
    expect(recommendPrice(4, undefined)).toBe(400);
    expect(recommendPrice(4, { avgMinor: 600, sales: 2 })).toBe(400);
    expect(recommendPrice(4, { avgMinor: 600, sales: 3 })).toBe(500);
    expect(recommendPrice(500, undefined)).toBe(10_000);
    expect(recommendPrice(null, undefined)).toBe(100);
  });
});

describe("MATCHX launch pricing", () => {
  it("price ranges put the best player at the max, curve down to the min, and use shop-style prices", () => {
    const n = 10;
    const prices = Array.from({ length: n }, (_, i) => bandPrice(i, n, 1200, 3999));
    expect(prices[0]).toBe(3999);
    expect(prices[n - 1]).toBe(1200);
    expect(prices.every((p, i) => i === 0 || p <= prices[i - 1])).toBe(true);
    expect(prices.every((p) => p % 100 === 99 || p === 1200)).toBe(true);
    expect(bandPrice(4, 5, 100, 199)).toBe(100);
    expect(bandPrice(0, 5, 100, 199)).toBe(199);
    expect(bandPrice(2, 5, 100, 400)).toBe(175);
  });

  it("a range listing prices higher-league players above lower-league ones, and named players get their set price", async () => {
    enableLegalGates();
    const admin = await makeUser("adm10");
    await stockHouseListings(admin.userId, { tier: "BRONZE", count: 8, minPriceMinor: 100, maxPriceMinor: 499 });
    const rows = await db.marketListing.findMany({ where: { house: true }, include: { card: { include: { template: { include: { player: { include: { club: { include: { league: true } } } } } } } } } });
    const top = Math.max(...rows.filter((r) => r.card.template.player.club!.league.tier === 1).map((r) => r.askingPriceMinor));
    const low = Math.min(...rows.filter((r) => r.card.template.player.club!.league.tier === 2).map((r) => r.askingPriceMinor));
    expect(top).toBeGreaterThanOrEqual(low);
    expect(Math.max(...rows.map((r) => r.askingPriceMinor))).toBe(499);
    expect(Math.min(...rows.map((r) => r.askingPriceMinor))).toBe(100);

    const name = (await db.player.findFirstOrThrow({ where: { templates: { some: { category: "GOLD" } } } })).displayName;
    const res = await stockPinnedListings(admin.userId, `${name}=45, Nobody=5, ${name}=200`);
    expect(res.listed).toHaveLength(1);
    expect(res.missed).toHaveLength(2);
    const pinned = await db.marketListing.findFirstOrThrow({ where: { house: true, askingPriceMinor: 4500 }, include: { card: { include: { template: true } } } });
    expect(pinned.card.template.category).toBe("GOLD");
    expect((await supplyReport()).reconciled).toBe(true);
  });
});

describe("house auctions", () => {
  async function auction(adminId: string, hours = 1) {
    const tpl = await db.cardTemplate.findFirstOrThrow({ where: { category: "GOLD" } });
    return createAuction(adminId, { playerId: tpl.playerId, category: "GOLD", startPriceMinor: 100, minIncrementMinor: 50, startsAt: new Date(Date.now() - 1000), hours });
  }

  it("bids hold cash MX, outbid managers get it back, and the winner gets the card", async () => {
    enableLegalGates();
    const admin = await makeUser("admin1");
    const a = await makeUser("aaa6");
    const b = await makeUser("bbb6");
    await fund(a.userId, 1000);
    await fund(b.userId, 1000);
    const au = await auction(admin.userId);
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: au.cardId } })).supplyState).toBe("RESERVED");

    await expect(placeBid(a.userId, au.id, 50)).rejects.toMatchObject({ code: "TOO_LOW" });
    await placeBid(a.userId, au.id, 100);
    await expect(placeBid(b.userId, au.id, 120)).rejects.toMatchObject({ code: "TOO_LOW" });
    await placeBid(b.userId, au.id, 150);
    expect((await balancesFor(a.userId)).earned).toBe(1000);
    expect((await balancesFor(b.userId)).earned).toBe(850);
    await placeBid(a.userId, au.id, 200);
    expect((await balancesFor(b.userId)).earned).toBe(1000);

    expect(await settleAuctions(new Date(Date.now() + 2 * 3_600_000))).toBe(1);
    const done = await db.auction.findUniqueOrThrow({ where: { id: au.id }, include: { card: true } });
    expect(done.status).toBe("SETTLED");
    expect(done.card.ownerId).toBe(a.userId);
    expect(done.card.supplyState).toBe("HELD");
    expect((await balancesFor(a.userId)).earned).toBe(800);
    expect((await supplyReport()).reconciled).toBe(true);
  });

  it("a late bid extends the auction (anti-sniping)", async () => {
    enableLegalGates();
    const admin = await makeUser("admin2");
    const a = await makeUser("aaa7");
    await fund(a.userId, 500);
    const au = await auction(admin.userId);
    const nearEnd = new Date(au.endsAt.getTime() - 30_000);
    const { endsAt } = await placeBid(a.userId, au.id, 100, nearEnd);
    expect(endsAt.getTime()).toBe(nearEnd.getTime() + 2 * 60_000);
  });

  it("cancelling returns bids and puts the card back in the pool", async () => {
    enableLegalGates();
    const admin = await makeUser("admin3");
    const a = await makeUser("aaa8");
    await fund(a.userId, 500);
    const au = await auction(admin.userId);
    await placeBid(a.userId, au.id, 100);
    await cancelAuction(admin.userId, au.id);
    expect((await balancesFor(a.userId)).earned).toBe(500);
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: au.cardId } })).supplyState).toBe("AVAILABLE");
  });
});

describe("card payments", () => {
  it("rejects forged webhooks", async () => {
    await expect(handlePaymentWebhook(JSON.stringify({ providerEventId: "x" }), "deadbeef")).rejects.toThrow(/signature/);
  });

  it("paid pack purchase grants exactly one pack, even if the webhook is delivered twice", async () => {
    enableLegalGates();
    const { userId } = await makeUser();
    const { orderId } = await startPackPurchase(userId, "football-silver", "click-1");
    expect((await startPackPurchase(userId, "football-silver", "click-1")).orderId).toBe(orderId);
    await pay(orderId, "e1");
    await pay(orderId, "e1");
    await pay(orderId, "e2");
    expect(await db.packEntitlement.count({ where: { userId, source: "PURCHASE" } })).toBe(1);
  });
});

describe("player drops", () => {
  it("one brand-new copy per player, live from a set time with no end; never packable; retired if withdrawn", async () => {
    const { scheduleDrops, dropBoard, cancelPlayerDrop } = await import("@/server/player-drops");
    enableLegalGates();
    const admin = await makeUser("adm20");
    const buyer = await makeUser("bbb20");
    await fund(buyer.userId, 5000);
    const tpl = await db.cardTemplate.findFirstOrThrow({ where: { category: "BRONZE", active: true, edition: "STANDARD" } });
    const other = await db.cardTemplate.findFirstOrThrow({ where: { category: "SILVER", active: true, edition: "STANDARD" } });
    const before = await db.cardInstance.count({ where: { templateId: tpl.id } });
    const later = new Date(Date.now() + 3_600_000);
    const r = await scheduleDrops(admin.userId, [
      { playerId: tpl.playerId, priceMinor: 50, liveAt: new Date(Date.now() - 1000) },
      { playerId: tpl.playerId, priceMinor: 60, liveAt: later },
      { playerId: other.playerId, priceMinor: 250, liveAt: later },
    ]);
    expect(r.created).toHaveLength(2);
    expect(r.skipped).toHaveLength(1);
    expect(await db.cardInstance.count({ where: { templateId: tpl.id } })).toBe(before + 1);
    const board = await dropBoard();
    expect(board.live).toHaveLength(1);
    expect(board.upcoming).toHaveLength(1);
    await expect(buyNow(buyer.userId, board.upcoming[0].id)).rejects.toMatchObject({ code: "NOT_LIVE" });
    await buyNow(buyer.userId, board.live[0].id);
    const card = await db.cardInstance.findUniqueOrThrow({ where: { id: board.live[0].card.id } });
    expect(card).toMatchObject({ ownerId: buyer.userId, supplyState: "HELD", packable: false });
    await cancelPlayerDrop(admin.userId, board.upcoming[0].id);
    const withdrawn = await db.marketListing.findUniqueOrThrow({ where: { id: board.upcoming[0].id }, include: { card: true } });
    expect(withdrawn.card.supplyState).toBe("RETIRED");
    expect((await supplyReport()).reconciled).toBe(true);
  });
});
