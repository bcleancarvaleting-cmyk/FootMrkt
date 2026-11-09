import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { lockOwnedCard } from "./cards";
import { type Tx, db, withTx } from "./db";
import { DomainError, isUniqueViolation } from "./errors";
import { requireFlag } from "./flags";
import { grantPack, latestSku } from "./packs";
import { type PaymentProvider, paymentProvider } from "./payments/provider";

/**
 * Transfer Market (spec §9.1) and paid packs. LEGAL GATE: every entry point requires the MARKET
 * or PAID_PACKS flag, which cannot be enabled until the deployment records legal clearance.
 * Seller payouts / cash withdrawal are intentionally NOT implemented (spec §9.3).
 */

export const ListingSchema = z.object({
  cardId: z.string().uuid(),
  askingPriceMinor: z.number().int().min(1).max(10_000_000),
  days: z.number().int().min(1).max(14).default(7),
});

export async function createListing(userId: string, input: z.input<typeof ListingSchema>) {
  await requireFlag("MARKET");
  const data = ListingSchema.parse(input);
  return withTx(async (tx) => {
    const card = await lockOwnedCard(tx, userId, data.cardId);
    if (card.tradeStatus !== "TRADEABLE") throw new DomainError("NOT_TRADEABLE", "This card can't be traded.");
    if (card.lock !== "NONE") throw new DomainError("CARD_BUSY", "This card is already listed or in a competition.");
    const listing = await tx.marketListing.create({
      data: {
        cardId: data.cardId,
        sellerId: userId,
        askingPriceMinor: data.askingPriceMinor,
        expiresAt: new Date(Date.now() + data.days * 24 * 3600_000),
      },
    });
    await tx.cardInstance.update({ where: { id: data.cardId }, data: { lock: "LISTED", lockRef: listing.id } });
    return listing;
  });
}

export async function cancelListing(userId: string, listingId: string) {
  await requireFlag("MARKET");
  return withTx(async (tx) => {
    const updated = await tx.marketListing.updateMany({
      where: { id: listingId, sellerId: userId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
    if (!updated.count) throw new DomainError("NOT_FOUND", "Listing not found or no longer active.");
    await tx.cardInstance.updateMany({ where: { lock: "LISTED", lockRef: listingId }, data: { lock: "NONE", lockRef: null } });
  });
}

export async function expireListings(now = new Date()) {
  const expired = await db.marketListing.findMany({ where: { status: "ACTIVE", expiresAt: { lte: now } }, select: { id: true } });
  for (const { id } of expired) {
    await withTx(async (tx) => {
      const u = await tx.marketListing.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
      if (u.count) await tx.cardInstance.updateMany({ where: { lock: "LISTED", lockRef: id }, data: { lock: "NONE", lockRef: null } });
    });
  }
  return expired.length;
}

async function createOrder(
  args: { userId: string; kind: "PACK_PURCHASE" | "MARKET_PURCHASE"; refId: string; amountMinor: number; idempotencyKey: string },
  provider: PaymentProvider,
) {
  try {
    const order = await db.order.create({
      data: { ...args, provider: provider.name },
    });
    const checkout = await provider.createCheckout({ id: order.id, amountMinor: order.amountMinor, currency: order.currency });
    await db.order.update({ where: { id: order.id }, data: { providerRef: checkout.providerRef } });
    return { orderId: order.id, checkoutUrl: checkout.checkoutUrl };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await db.order.findUniqueOrThrow({ where: { idempotencyKey: args.idempotencyKey } });
    if (existing.status !== "PENDING") throw new DomainError("ORDER_DONE", "This order has already been processed.");
    const checkout = await provider.createCheckout({ id: existing.id, amountMinor: existing.amountMinor, currency: existing.currency });
    return { orderId: existing.id, checkoutUrl: checkout.checkoutUrl };
  }
}

export async function startListingPurchase(buyerId: string, listingId: string, provider = paymentProvider()) {
  await requireFlag("MARKET");
  const listing = await db.marketListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "ACTIVE" || listing.expiresAt <= new Date()) throw new DomainError("NOT_AVAILABLE", "This listing is no longer available.");
  if (listing.sellerId === buyerId) throw new DomainError("OWN_LISTING", "You can't buy your own listing.");
  return createOrder(
    { userId: buyerId, kind: "MARKET_PURCHASE", refId: listingId, amountMinor: listing.askingPriceMinor, idempotencyKey: `buy:${listingId}:${buyerId}` },
    provider,
  );
}

export async function startPackPurchase(userId: string, skuCode: string, clientKey: string, provider = paymentProvider()) {
  await requireFlag("PAID_PACKS");
  const sku = await latestSku(skuCode);
  if (sku.kind !== "REGULAR" || sku.priceMinor <= 0) throw new DomainError("NOT_FOR_SALE", "This pack isn't for sale.");
  return createOrder(
    { userId, kind: "PACK_PURCHASE", refId: sku.id, amountMinor: sku.priceMinor, idempotencyKey: `pack:${userId}:${clientKey}` },
    provider,
  );
}

/**
 * Verified, idempotent webhook handling (spec §9.1, §15). Each provider event id is processed
 * once; fulfilment (pack grant / ownership transfer) is in the same transaction as the order
 * status change, so a replayed webhook can never duplicate an order, pack or transfer.
 */
export async function handlePaymentWebhook(rawBody: string, signature: string | null, provider = paymentProvider()) {
  const event = provider.verifyWebhook(rawBody, signature);
  const result = await withTx(async (tx) => {
    const inserted = await tx.paymentEvent.createMany({
      data: [{ provider: provider.name, providerEventId: event.providerEventId, type: event.type, payload: event as unknown as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    if (!inserted.count) return { status: "duplicate" as const };
    const [order] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Order" WHERE provider = ${provider.name} AND "providerRef" = ${event.providerRef} FOR UPDATE`;
    if (!order) return { status: "unknown_order" as const };
    const o = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    await tx.paymentEvent.updateMany({ where: { provider: provider.name, providerEventId: event.providerEventId }, data: { orderId: o.id } });

    if (event.type === "payment.failed") {
      if (o.status === "PENDING") await tx.order.update({ where: { id: o.id }, data: { status: "FAILED" } });
      return { status: "failed" as const };
    }
    if (event.type === "payment.refunded") {
      await tx.order.update({ where: { id: o.id }, data: { status: "REFUNDED" } });
      return { status: "refunded" as const };
    }
    if (o.status !== "PENDING") return { status: "already_processed" as const };
    if (event.amountMinor !== o.amountMinor || event.currency !== o.currency) {
      await tx.order.update({ where: { id: o.id }, data: { status: "FAILED" } });
      return { status: "amount_mismatch" as const, refund: true, providerRef: event.providerRef, amountMinor: event.amountMinor };
    }
    await tx.order.update({ where: { id: o.id }, data: { status: "PAID" } });
    if (o.kind === "PACK_PURCHASE") {
      const sku = await tx.packSku.findUniqueOrThrow({ where: { id: o.refId } });
      await grantPack(tx, { userId: o.userId, skuCode: sku.code, source: "PURCHASE", sourceRef: `order:${o.id}` });
      return { status: "fulfilled" as const };
    }
    const sold = await completeSale(tx, o.refId, o.userId, o.amountMinor, o.id);
    if (!sold) {
      // Someone else completed the purchase first: refund this buyer.
      await tx.order.update({ where: { id: o.id }, data: { status: "REFUNDED" } });
      return { status: "refund_required" as const, refund: true, providerRef: event.providerRef, amountMinor: o.amountMinor };
    }
    return { status: "fulfilled" as const };
  });
  if ("refund" in result && result.refund) await provider.refund(result.providerRef, result.amountMinor);
  return result;
}

/** Atomic ownership transfer. Returns false if the listing is no longer available. */
async function completeSale(tx: Tx, listingId: string, buyerId: string, priceMinor: number, orderId: string) {
  const [listing] = await tx.$queryRaw<Array<{ id: string; status: string; cardId: string; sellerId: string; expiresAt: Date }>>`
    SELECT id, status, "cardId", "sellerId", "expiresAt" FROM "MarketListing" WHERE id = ${listingId}::uuid FOR UPDATE`;
  if (!listing || listing.status !== "ACTIVE") return false;
  const [card] = await tx.$queryRaw<Array<{ ownerId: string; lock: string; lockRef: string }>>`
    SELECT "ownerId", "lock", "lockRef" FROM "CardInstance" WHERE id = ${listing.cardId}::uuid FOR UPDATE`;
  if (!card || card.ownerId !== listing.sellerId || card.lock !== "LISTED" || card.lockRef !== listing.id) return false;

  const now = new Date();
  await tx.marketListing.update({
    where: { id: listing.id },
    data: { status: "SOLD", buyerId, soldPriceMinor: priceMinor, soldAt: now },
  });
  const closed = await tx.cardOwnership.updateMany({
    where: { cardId: listing.cardId, userId: listing.sellerId, releasedAt: null },
    data: { releasedAt: now, releasedVia: "MARKET_SALE", releasedRef: orderId },
  });
  if (closed.count !== 1) throw new Error("Seller ownership record missing");
  await tx.cardOwnership.create({ data: { cardId: listing.cardId, userId: buyerId, acquiredVia: "MARKET", acquiredRef: orderId, acquiredAt: now } });
  await tx.cardInstance.update({ where: { id: listing.cardId }, data: { ownerId: buyerId, lock: "NONE", lockRef: null } });
  await tx.favouriteCard.deleteMany({ where: { cardId: listing.cardId } });
  return true;
}
