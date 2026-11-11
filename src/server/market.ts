import type { Prisma } from "@/generated/prisma/client";
import { db, withTx } from "./db";
import { DomainError, isUniqueViolation } from "./errors";
import { requireFlag } from "./flags";
import { grantPack, latestSku } from "./packs";
import { loadPayments, requireCardPayments } from "./payments/config";
import { type PaymentProvider, paymentProvider } from "./payments/provider";
import { assertCanSpend } from "./safer-play";
import { fulfilDeposit, isAdult } from "./wallet";

/**
 * Card payments: paid packs (£ by card) and adding funds. P2P transfers and auctions are MX-only
 * and live in ./transfers. LEGAL GATE: PAID_PACKS / DEPOSITS must be cleared before use.
 */

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

export async function startPackPurchase(userId: string, skuCode: string, clientKey: string, given?: PaymentProvider) {
  await requireFlag("PACK_SHOP");
  await requireFlag("PAID_PACKS");
  await requireCardPayments();
  const provider = given ?? paymentProvider();
  const sku = await latestSku(skuCode);
  if (sku.kind !== "REGULAR" || sku.priceMinor <= 0) throw new DomainError("NOT_FOR_SALE", "This pack isn't for sale.");
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!isAdult(user.dateOfBirth)) throw new DomainError("AGE", "Add your date of birth in My Account → Profile. You must be 18 or over to buy packs.");
  await assertCanSpend(userId, sku.priceMinor);
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
export async function handlePaymentWebhook(rawBody: string, signature: string | null, given?: PaymentProvider) {
  await loadPayments();
  const provider = given ?? paymentProvider();
  const event = provider.verifyWebhook(rawBody, signature);
  const result = await withTx(async (tx) => {
    const inserted = await tx.paymentEvent.createMany({
      data: [{ provider: provider.name, providerEventId: event.providerEventId, type: event.type, payload: event as unknown as Prisma.InputJsonValue }],
      skipDuplicates: true,
    });
    if (!inserted.count) return { status: "duplicate" as const };
    if (event.type === "payment.ignored") return { status: "ignored" as const };
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
    if (o.kind === "DEPOSIT") {
      await fulfilDeposit(tx, o);
      return { status: "fulfilled" as const };
    }
    // Transfers are MX-only now: a legacy card-paid market order is refunded, never fulfilled.
    await tx.order.update({ where: { id: o.id }, data: { status: "REFUNDED" } });
    return { status: "refund_required" as const, refund: true, providerRef: event.providerRef, amountMinor: o.amountMinor };
  });
  if ("refund" in result && result.refund) await provider.refund(result.providerRef, result.amountMinor);
  return result;
}
