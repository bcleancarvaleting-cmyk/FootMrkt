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
import { buildWorld, makeTrader, makeUser, resetDb } from "./fixtures";

const kinds = async (userId: string) => (await db.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map((n) => n.title);

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
    const { userId } = await makeTrader();
    const card = await tradeableCard(userId);
    await expect(createListing(userId, { cardId: card, askingPriceMinor: 500 })).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await expect(startPackPurchase(userId, "football-bronze", "k")).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
  });

  it("an admin cannot switch a legal-gated flag on, and flag changes are audited", async () => {
    const { userId } = await makeTrader();
    await expect(setFlag(userId, "MARKET", true)).rejects.toMatchObject({ code: "LEGAL_GATE" });
    await expect(setFlag(userId, "WITHDRAWALS", true)).rejects.toMatchObject({ code: "LEGAL_GATE" });
    await setFlag(userId, "DEV_TOOLS", false);
    expect(await db.adminAuditLog.count({ where: { action: "flag.set", entityId: "DEV_TOOLS" } })).toBe(1);
  });
});

describe("P2P transfers in MX", () => {
  it("locks listed cards, blocks untradeable, duplicate and over-100-MX listings", async () => {
    enableLegalGates();
    const { userId, starterEntitlementId } = await makeTrader();
    const starter = await openPack(userId, starterEntitlementId);
    await expect(createListing(userId, { cardId: starter.cards[0].cardId, askingPriceMinor: 500 })).rejects.toMatchObject({ code: "NOT_TRADEABLE" });
    const card = await tradeableCard(userId);
    await expect(createListing(userId, { cardId: card, askingPriceMinor: 10_001 })).rejects.toThrow(/100 MX/);
    const listing = await createListing(userId, { cardId: card, askingPriceMinor: 500 });
    expect(listing.currency).toBe("MX");
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: card } })).lock).toBe("LISTED");
    await expect(createListing(userId, { cardId: card, askingPriceMinor: 600 })).rejects.toMatchObject({ code: "CARD_BUSY" });
    // Listings are final: they stay up until sold or expired.
    await expect(cancelListing(userId, listing.id)).rejects.toMatchObject({ code: "FINAL" });
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: card } })).lock).toBe("LISTED");
  });

  it("buy now moves the card, pays the seller minus 5%, and a card can't be sold twice", async () => {
    enableLegalGates();
    const seller = await makeTrader("seller");
    const b1 = await makeTrader("buyer1");
    const b2 = await makeTrader("buyer2");
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
    expect(await kinds(seller.userId)).toEqual(["💸 Player sold"]);
  });

  it("bought MX can't buy players from other managers (Transfer list is earned MX only)", async () => {
    enableLegalGates();
    const seller = await makeTrader("sss3");
    const buyer = await makeTrader("bbb5");
    await withTx((tx) => credit(tx, { userId: buyer.userId, amountMinor: 5000, kind: "DEPOSIT", bucket: "CASH", refId: "bought-1" }));
    const listing = await createListing(seller.userId, { cardId: await tradeableCard(seller.userId), askingPriceMinor: 300 });
    await expect(buyNow(buyer.userId, listing.id)).rejects.toMatchObject({ code: "EARNED_ONLY" });
  });

  it("earned MX can buy cards (MX is never withdrawable), and sale proceeds are earned MX, not winnings", async () => {
    enableLegalGates();
    const seller = await makeTrader("sss2");
    const buyer = await makeTrader("bbb3");
    await withTx((tx) => credit(tx, { userId: buyer.userId, amountMinor: 500, kind: "CHALLENGE_REWARD", refId: "bonus-1" }));
    const listing = await createListing(seller.userId, { cardId: await tradeableCard(seller.userId), askingPriceMinor: 300 });
    await buyNow(buyer.userId, listing.id);
    expect(await balancesFor(buyer.userId)).toMatchObject({ bonus: 200, total: 200 });
    expect(await balancesFor(seller.userId)).toMatchObject({ total: 285, winnings: 0, withdrawable: 0 });
  });

  it("MATCHX listings: cards from circulation, buy now only, unsold cards return to packs", async () => {
    enableLegalGates();
    const admin = await makeTrader("adm9");
    const buyer = await makeTrader("bbb9");
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
    const seller = await makeTrader("sss4");
    const a = await makeTrader("aaa4");
    const b = await makeTrader("bbb4");
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
    // Phone/in-app alerts: the seller hears about every offer, buyers hear the answer.
    expect((await kinds(seller.userId)).filter((t) => t === "📩 New offer")).toHaveLength(5);
    expect(await kinds(seller.userId)).toContain("💸 Player sold");
    expect(await kinds(a.userId)).toEqual(["✍️ New signing!"]);
    expect(await kinds(b.userId)).toEqual(["Offer declined"]);
  });

  it("expiring a listing returns held offers", async () => {
    enableLegalGates();
    const seller = await makeTrader("sss5");
    const a = await makeTrader("aaa5");
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
    const admin = await makeTrader("adm10");
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

  it("drops cost exactly the price shown, with no fee, and can be paid with bought MX", async () => {
    const { scheduleDrops, dropBoard } = await import("@/server/player-drops");
    enableLegalGates();
    const admin = await makeTrader("adm21");
    const buyer = await makeTrader("bbb21");
    await withTx((tx) => credit(tx, { userId: buyer.userId, amountMinor: 500, kind: "DEPOSIT", bucket: "CASH", refId: "bought-drop" }));
    const tpl = await db.cardTemplate.findFirstOrThrow({ where: { category: "BRONZE", active: true, edition: "STANDARD" } });
    await scheduleDrops(admin.userId, [{ playerId: tpl.playerId, priceMinor: 126, liveAt: new Date(Date.now() - 1000) }]);
    const [drop] = (await dropBoard()).live;
    const before = await balancesFor(buyer.userId);
    await buyNow(buyer.userId, drop.id);
    const after = await balancesFor(buyer.userId);
    expect(before.total - after.total).toBe(126);
    const sold = await db.marketListing.findUniqueOrThrow({ where: { id: drop.id } });
    expect(sold).toMatchObject({ status: "SOLD", soldPriceMinor: 126, feeMinor: null });
    // The drop isn't on the player-to-player Transfer list.
    const { transferBoard } = await import("@/server/transfers-view");
    await scheduleDrops(admin.userId, [{ playerId: tpl.playerId, priceMinor: 126, liveAt: new Date(Date.now() - 1000) }]);
    expect((await transferBoard({}, null)).some((r) => r.house)).toBe(false);
  });
});

describe("house auctions", () => {
  async function auction(adminId: string, hours = 1) {
    const tpl = await db.cardTemplate.findFirstOrThrow({ where: { category: "GOLD" } });
    return createAuction(adminId, { playerId: tpl.playerId, category: "GOLD", startPriceMinor: 100, minIncrementMinor: 50, startsAt: new Date(Date.now() - 1000), hours });
  }

  it("manager auctions: 3/12/24 hours, bids, buy-it-now ends it, the seller is paid minus 5%", async () => {
    enableLegalGates();
    const { createManagerAuction, buyNowAuction } = await import("@/server/transfers");
    const seller = await makeTrader("msell");
    const a = await makeTrader("mbid1");
    const b = await makeTrader("mbid2");
    await fund(a.userId, 1000);
    await fund(b.userId, 1000);
    const cardId = await tradeableCard(seller.userId);
    await expect(createManagerAuction(seller.userId, { cardId, startPriceMinor: 100, hours: 6 as never })).rejects.toThrow();
    await expect(createManagerAuction(seller.userId, { cardId, startPriceMinor: 300, buyNowMinor: 200, hours: 3 })).rejects.toThrow(/higher than the starting price/);
    const au = await createManagerAuction(seller.userId, { cardId, startPriceMinor: 100, buyNowMinor: 500, hours: 12 });
    expect(au.endsAt.getTime() - au.startsAt.getTime()).toBe(12 * 3_600_000);
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: cardId } })).lock).toBe("LISTED");
    await expect(placeBid(seller.userId, au.id, 100)).rejects.toMatchObject({ code: "OWN_AUCTION" });
    await expect(placeBid(a.userId, au.id, 500)).rejects.toMatchObject({ code: "USE_BUY_NOW" });
    await placeBid(a.userId, au.id, 150);
    // b buys it outright: a's bid comes back, b pays 5.00, the seller gets 4.75 bonus MX.
    await buyNowAuction(b.userId, au.id);
    expect((await balancesFor(a.userId)).earned).toBe(1000);
    expect((await balancesFor(b.userId)).earned).toBe(500);
    expect((await balancesFor(seller.userId)).earned).toBe(500 - feeFor(500));
    const card = await db.cardInstance.findUniqueOrThrow({ where: { id: cardId } });
    expect(card).toMatchObject({ ownerId: b.userId, lock: "NONE" });
    expect((await db.auction.findUniqueOrThrow({ where: { id: au.id } })).status).toBe("SETTLED");

    // Unsold: the card goes back to its owner, unlocked.
    const card2 = await tradeableCard(seller.userId);
    const au2 = await createManagerAuction(seller.userId, { cardId: card2, startPriceMinor: 100, hours: 3 });
    expect(await settleAuctions(new Date(Date.now() + 4 * 3_600_000))).toBe(1);
    expect(await db.cardInstance.findUniqueOrThrow({ where: { id: card2 } })).toMatchObject({ ownerId: seller.userId, lock: "NONE", supplyState: "HELD" });
    expect((await db.auction.findUniqueOrThrow({ where: { id: au2.id } })).status).toBe("UNSOLD");

    // A minimum price that bidding doesn't reach: no sale, the bidder gets their MX back.
    await expect(createManagerAuction(seller.userId, { cardId: await tradeableCard(seller.userId), startPriceMinor: 200, reserveMinor: 100, hours: 3 })).rejects.toThrow(/below the starting bid/);
    const cardR = await tradeableCard(seller.userId);
    const auR = await createManagerAuction(seller.userId, { cardId: cardR, startPriceMinor: 100, reserveMinor: 400, buyNowMinor: 600, hours: 3 });
    const before = (await balancesFor(a.userId)).earned;
    await placeBid(a.userId, auR.id, 300);
    await settleAuctions(new Date(Date.now() + 4 * 3_600_000));
    expect((await db.auction.findUniqueOrThrow({ where: { id: auR.id } })).status).toBe("UNSOLD");
    expect(await db.cardInstance.findUniqueOrThrow({ where: { id: cardR } })).toMatchObject({ ownerId: seller.userId, lock: "NONE" });
    expect((await balancesFor(a.userId)).earned).toBe(before);

    // Won at the end: highest bid takes it.
    const card3 = await tradeableCard(seller.userId);
    const au3 = await createManagerAuction(seller.userId, { cardId: card3, startPriceMinor: 100, hours: 24 });
    await placeBid(a.userId, au3.id, 200);
    await settleAuctions(new Date(Date.now() + 25 * 3_600_000));
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: card3 } })).ownerId).toBe(a.userId);
    expect((await balancesFor(seller.userId)).earned).toBe(500 - feeFor(500) + 200 - feeFor(200));
  });

  it("bids hold cash MX, outbid managers get it back, and the winner gets the card", async () => {
    enableLegalGates();
    const admin = await makeTrader("admin1");
    const a = await makeTrader("aaa6");
    const b = await makeTrader("bbb6");
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
    expect(await kinds(a.userId)).toEqual(["⚠️ You've been outbid", "🔨 Auction won!"]);
    expect(await kinds(b.userId)).toEqual(["⚠️ You've been outbid"]);
  });

  it("a late bid extends the auction (anti-sniping)", async () => {
    enableLegalGates();
    const admin = await makeTrader("admin2");
    const a = await makeTrader("aaa7");
    await fund(a.userId, 500);
    const au = await auction(admin.userId);
    const nearEnd = new Date(au.endsAt.getTime() - 30_000);
    const { endsAt } = await placeBid(a.userId, au.id, 100, nearEnd);
    expect(endsAt.getTime()).toBe(nearEnd.getTime() + 2 * 60_000);
  });

  it("cancelling returns bids and puts the card back in the pool", async () => {
    enableLegalGates();
    const admin = await makeTrader("admin3");
    const a = await makeTrader("aaa8");
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

  it("refuses card pack purchases without an 18+ date of birth", async () => {
    enableLegalGates();
    const { userId } = await makeTrader();
    await expect(startPackPurchase(userId, "football-silver", "click-x")).rejects.toThrow(/18 or over/);
  });

  it("paid pack purchase grants exactly one pack, even if the webhook is delivered twice", async () => {
    enableLegalGates();
    const { userId } = await makeTrader();
    await db.user.update({ where: { id: userId }, data: { dateOfBirth: new Date("1990-01-01") } });
    const { orderId } = await startPackPurchase(userId, "football-silver", "click-1");
    expect((await startPackPurchase(userId, "football-silver", "click-1")).orderId).toBe(orderId);
    await pay(orderId, "e1");
    await pay(orderId, "e1");
    await pay(orderId, "e2");
    expect(await db.packEntitlement.count({ where: { userId, source: "PURCHASE" } })).toBe(1);
  });
});

describe("special-finish pricing", () => {
  it("normal cards cap at 100 MX; a Rainbow can be listed for thousands, with the same 5% fee", async () => {
    enableLegalGates();
    const seller = await makeTrader("rainbowseller");
    const cardId = await tradeableCard(seller.userId);
    await expect(createListing(seller.userId, { cardId, askingPriceMinor: 10_001 })).rejects.toMatchObject({ code: "PRICE_CAP" });
    const card = await db.cardInstance.findUniqueOrThrow({ where: { id: cardId }, include: { template: true } });
    await db.cardFinish.create({ data: { kind: "RAINBOW", playerId: card.template.playerId, serial: 1, cardId } });
    const l = await createListing(seller.userId, { cardId, askingPriceMinor: 250_000 }); // 2,500 MX
    expect(l.askingPriceMinor).toBe(250_000);
    expect(feeFor(250_000)).toBe(12_500); // 125 MX to MATCHX
  });
});

describe("player drops", () => {
  it("one brand-new copy per player, live from a set time with no end; never packable; retired if withdrawn", async () => {
    const { scheduleDrops, dropBoard, cancelPlayerDrop } = await import("@/server/player-drops");
    enableLegalGates();
    const admin = await makeTrader("adm20");
    const buyer = await makeTrader("bbb20");
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

  it("drops cost exactly the price shown, with no fee, and can be paid with bought MX", async () => {
    const { scheduleDrops, dropBoard } = await import("@/server/player-drops");
    enableLegalGates();
    const admin = await makeTrader("adm21");
    const buyer = await makeTrader("bbb21");
    await withTx((tx) => credit(tx, { userId: buyer.userId, amountMinor: 500, kind: "DEPOSIT", bucket: "CASH", refId: "bought-drop" }));
    const tpl = await db.cardTemplate.findFirstOrThrow({ where: { category: "BRONZE", active: true, edition: "STANDARD" } });
    await scheduleDrops(admin.userId, [{ playerId: tpl.playerId, priceMinor: 126, liveAt: new Date(Date.now() - 1000) }]);
    const [drop] = (await dropBoard()).live;
    const before = await balancesFor(buyer.userId);
    await buyNow(buyer.userId, drop.id);
    const after = await balancesFor(buyer.userId);
    expect(before.total - after.total).toBe(126);
    const sold = await db.marketListing.findUniqueOrThrow({ where: { id: drop.id } });
    expect(sold).toMatchObject({ status: "SOLD", soldPriceMinor: 126, feeMinor: null });
    // The drop isn't on the player-to-player Transfer list.
    const { transferBoard } = await import("@/server/transfers-view");
    await scheduleDrops(admin.userId, [{ playerId: tpl.playerId, priceMinor: 126, liveAt: new Date(Date.now() - 1000) }]);
    expect((await transferBoard({}, null)).some((r) => r.house)).toBe(false);
  });
});

describe("market safeguards", () => {
  it("new or unverified accounts can't list or buy on the Transfer list", async () => {
    enableLegalGates();
    const { userId: fresh } = await makeUser();
    const card = await tradeableCard(fresh);
    await expect(createListing(fresh, { cardId: card, askingPriceMinor: 200 })).rejects.toMatchObject({ code: "VERIFY_EMAIL" });
    await db.user.update({ where: { id: fresh }, data: { emailVerifiedAt: new Date() } });
    await expect(createListing(fresh, { cardId: card, askingPriceMinor: 200 })).rejects.toMatchObject({ code: "NEW_ACCOUNT" });

    const seller = await makeTrader();
    const listing = await createListing(seller.userId, { cardId: await tradeableCard(seller.userId), askingPriceMinor: 200 });
    await fund(fresh, 1000);
    await expect(buyNow(fresh, listing.id)).rejects.toMatchObject({ code: "NEW_ACCOUNT" });
  });

  it("asks the seller to confirm a price far above the guide", async () => {
    enableLegalGates();
    const seller = await makeTrader();
    const cardId = await tradeableCard(seller.userId);
    const card = await db.cardInstance.findUniqueOrThrow({ where: { id: cardId }, include: { template: true } });
    await db.mPValuation.create({ data: { playerId: card.template.playerId, category: card.template.category, valueMp: 2, method: "test", signals: {} } });
    await expect(createListing(seller.userId, { cardId, askingPriceMinor: 900 })).rejects.toMatchObject({ code: "HIGH_PRICE" });
    await expect(createListing(seller.userId, { cardId, askingPriceMinor: 900, confirmHigh: true })).resolves.toBeTruthy();
  });

  it("holds repeat trades between the same two managers for review", async () => {
    enableLegalGates();
    const a = await makeTrader();
    const b = await makeTrader();
    await fund(b.userId, 5000);
    for (let i = 0; i < 3; i++) {
      const l = await createListing(a.userId, { cardId: await tradeableCard(a.userId), askingPriceMinor: 300 });
      await buyNow(b.userId, l.id);
    }
    const flags = await db.tradeFlag.findMany();
    expect(flags).toHaveLength(1);
    expect(flags[0].reasons).toContain("PAIR_REPEAT");
  });

  it("holds sales between accounts that logged in from the same network", async () => {
    enableLegalGates();
    const a = await makeTrader();
    const b = await makeTrader();
    await db.session.createMany({ data: [{ id: "s-a", userId: a.userId, expiresAt: new Date(Date.now() + 1e8), ipHash: "same" }, { id: "s-b", userId: b.userId, expiresAt: new Date(Date.now() + 1e8), ipHash: "same" }] });
    await fund(b.userId, 1000);
    const l = await createListing(a.userId, { cardId: await tradeableCard(a.userId), askingPriceMinor: 300 });
    await buyNow(b.userId, l.id);
    expect((await db.tradeFlag.findFirstOrThrow()).reasons).toEqual(["SHARED_NETWORK"]);
  });
});
