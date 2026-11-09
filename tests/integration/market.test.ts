import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db";
import { setFlag } from "@/server/flags";
import { cancelListing, createListing, handlePaymentWebhook, startListingPurchase, startPackPurchase } from "@/server/market";
import { grantPack, openPack } from "@/server/packs";
import { signSandbox } from "@/server/payments/provider";
import { supplyReport } from "@/server/supply";
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
}

async function pay(orderId: string, eventId = `evt-${orderId}`) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const body = JSON.stringify({ providerEventId: eventId, type: "payment.succeeded", providerRef: order.providerRef, amountMinor: order.amountMinor, currency: order.currency });
  return handlePaymentWebhook(body, signSandbox(body));
}

async function tradeableCard(userId: string) {
  const ent = await withTx((tx) => grantPack(tx, { userId, skuCode: "football-bronze", source: "DEV", sourceRef: `dev:${userId}` }));
  const res = await openPack(userId, ent.id);
  return res.cards[0].cardId;
}

describe("legal gate (spec §9.3, §17)", () => {
  it("market and paid packs are unavailable while the gate is closed, even if an env flag says on", async () => {
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
    await setFlag(userId, "DEV_TOOLS", false);
    expect(await db.adminAuditLog.count({ where: { action: "flag.set", entityId: "DEV_TOOLS" } })).toBe(1);
  });
});

describe("transfer market (spec §9.1, §17)", () => {
  it("locks listed cards, blocks untradeable and duplicate listings", async () => {
    enableLegalGates();
    const { userId, starterEntitlementId } = await makeUser();
    const starter = await openPack(userId, starterEntitlementId);
    await expect(createListing(userId, { cardId: starter.cards[0].cardId, askingPriceMinor: 500 })).rejects.toMatchObject({ code: "NOT_TRADEABLE" });

    const card = await tradeableCard(userId);
    const listing = await createListing(userId, { cardId: card, askingPriceMinor: 500 });
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: card } })).lock).toBe("LISTED");
    await expect(createListing(userId, { cardId: card, askingPriceMinor: 600 })).rejects.toMatchObject({ code: "CARD_BUSY" });
    await cancelListing(userId, listing.id);
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: card } })).lock).toBe("NONE");
  });

  it("a card cannot be sold twice: the second paid buyer is refunded; webhook replays are no-ops", async () => {
    enableLegalGates();
    const seller = await makeUser("seller");
    const b1 = await makeUser("buyer1");
    const b2 = await makeUser("buyer2");
    const card = await tradeableCard(seller.userId);
    const listing = await createListing(seller.userId, { cardId: card, askingPriceMinor: 750 });

    const o1 = await startListingPurchase(b1.userId, listing.id);
    const o2 = await startListingPurchase(b2.userId, listing.id);
    const [r1, r2] = await Promise.all([pay(o1.orderId), pay(o2.orderId)]);
    expect([r1.status, r2.status].sort()).toEqual(["fulfilled", "refund_required"]);

    const after = await db.cardInstance.findUniqueOrThrow({ where: { id: card } });
    const winner = r1.status === "fulfilled" ? b1.userId : b2.userId;
    expect(after.ownerId).toBe(winner);
    expect(after.lock).toBe("NONE");
    const history = await db.cardOwnership.findMany({ where: { cardId: card }, orderBy: { acquiredAt: "asc" } });
    expect(history.map((h) => [h.userId, h.releasedVia])).toEqual([
      [seller.userId, "MARKET_SALE"],
      [winner, null],
    ]);

    // Replaying the winning webhook changes nothing.
    const replay = await pay(r1.status === "fulfilled" ? o1.orderId : o2.orderId);
    expect(replay.status).toBe("duplicate");
    expect(await db.cardOwnership.count({ where: { cardId: card } })).toBe(2);
    expect((await supplyReport()).reconciled).toBe(true);
  });

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
    await pay(orderId, "e2"); // a different event for an already-paid order
    expect(await db.packEntitlement.count({ where: { userId, source: "PURCHASE" } })).toBe(1);
  });
});
