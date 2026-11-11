import type { Prisma } from "@/generated/prisma/client";
import { db, withTx } from "./db";
import { DomainError, isUniqueViolation } from "./errors";
import { requireFlag } from "./flags";
import { grantPack, latestSku } from "./packs";
import { loadPayments, requireCardPayments } from "./payments/config";
import { type PaymentProvider, type PaymentWebhookEvent, paymentProvider } from "./payments/provider";
import { assertCanSpend } from "./safer-play";
import { fulfilDeposit, isAdult } from "./wallet";

/**
 * Card payments: paid packs (£ by card) and adding funds. P2P transfers and auctions are MX-only
 * and live in ./transfers. LEGAL GATE: PAID_PACKS / DEPOSITS must be cleared before use.
 */

/** After paying for a pack you land back on Packs, where the "building your pack" animation plays. */
const returnPathFor = (kind: string) => (kind === "PACK_PURCHASE" ? "/packs" : undefined);

async function createOrder(
  args: { userId: string; kind: "PACK_PURCHASE" | "MARKET_PURCHASE"; refId: string; amountMinor: number; idempotencyKey: string },
  provider: PaymentProvider,
) {
  try {
    const order = await db.order.create({
      data: { ...args, provider: provider.name },
    });
    const checkout = await provider.createCheckout({ id: order.id, amountMinor: order.amountMinor, currency: order.currency, returnPath: returnPathFor(args.kind) });
    await db.order.update({ where: { id: order.id }, data: { providerRef: checkout.providerRef } });
    return { orderId: order.id, checkoutUrl: checkout.checkoutUrl };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await db.order.findUniqueOrThrow({ where: { idempotencyKey: args.idempotencyKey } });
    if (existing.status !== "PENDING") throw new DomainError("ORDER_DONE", "This order has already been processed.");
    const checkout = await provider.createCheckout({ id: existing.id, amountMinor: existing.amountMinor, currency: existing.currency, returnPath: returnPathFor(args.kind) });
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
  return processPaymentEvent(event, provider);
}

/**
 * Apply one verified payment event (from a signed webhook, or from asking the provider directly).
 * Idempotent: each event id once, and an order is only ever fulfilled once whichever arrives first.
 */
async function processPaymentEvent(event: PaymentWebhookEvent, provider: PaymentProvider) {
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

/**
 * A pack order's progress, for the post-payment screen: PENDING until the payment provider's
 * signed webhook confirms it, then PAID with the new pack's id (or FAILED).
 */
export async function packOrderStatus(userId: string, orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o || o.userId !== userId || o.kind !== "PACK_PURCHASE") return null;
  const ent = o.status === "PAID" ? await db.packEntitlement.findUnique({ where: { sourceRef: `order:${o.id}` }, include: { packSku: { select: { name: true } } } }) : null;
  return { status: o.status, entitlementId: ent?.status === "UNOPENED" ? ent.id : null, opened: ent ? ent.status !== "UNOPENED" : false, packName: ent?.packSku.name ?? null };
}

/**
 * Belt and braces for card payments: if the manager is back from Stripe but the webhook hasn't
 * arrived (not set up yet, delayed, or blocked), ask Stripe directly whether the checkout was paid
 * and fulfil the order the same way. Safe to call repeatedly; does nothing for other providers.
 */
export async function confirmOrderWithProvider(userId: string, orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o || o.userId !== userId || o.status !== "PENDING" || o.provider !== "stripe" || !o.providerRef) return null;
  const { stripeSessionStatus, stripeProvider } = await import("./payments/stripe");
  const s = await stripeSessionStatus(o.providerRef).catch(() => null);
  if (!s) return null;
  if (s.paid) {
    return processPaymentEvent({ providerEventId: `poll:${o.providerRef}`, type: "payment.succeeded", providerRef: o.providerRef, amountMinor: s.amountMinor, currency: s.currency }, stripeProvider);
  }
  if (s.expired) {
    return processPaymentEvent({ providerEventId: `poll-expired:${o.providerRef}`, type: "payment.failed", providerRef: o.providerRef, amountMinor: s.amountMinor, currency: s.currency }, stripeProvider);
  }
  return null;
}

/** Check this manager's card payments from the last day that are still waiting (packs page load). */
export async function confirmWaitingOrders(userId: string, now = new Date()) {
  const waiting = await db.order.findMany({ where: { userId, provider: "stripe", status: "PENDING", createdAt: { gt: new Date(now.getTime() - 86_400_000) } }, select: { id: true }, take: 5 });
  for (const o of waiting) await confirmOrderWithProvider(userId, o.id).catch(() => null);
}

/** For Admin → Integrations: when Stripe's last real webhook arrived, and orders stuck waiting. */
export async function stripeHealth(now = new Date()) {
  const [lastHook, stuck] = await Promise.all([
    db.paymentEvent.findFirst({ where: { provider: "stripe", NOT: { providerEventId: { startsWith: "poll" } } }, orderBy: { receivedAt: "desc" } }),
    db.order.count({ where: { provider: "stripe", status: "PENDING", createdAt: { lt: new Date(now.getTime() - 5 * 60_000) } } }),
  ]);
  return { lastHook, stuck };
}

/** Admin: what Stripe says about an order, then fix it up if Stripe says it's paid. */
export async function diagnoseOrder(orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId } });
  if (!o) return "Order not found.";
  const head = `Order ${o.id.slice(0, 8)} · ${o.kind.toLowerCase().replace("_", " ")} · £${(o.amountMinor / 100).toFixed(2)} · ${o.provider} · ${o.status.toLowerCase()}`;
  if (o.provider !== "stripe") return `${head}. Not a Stripe order (made while payments were in ${o.provider} mode).`;
  if (!o.providerRef) return `${head}. No Stripe checkout was created for it.`;
  try {
    const { stripeSessionStatus } = await import("./payments/stripe");
    const s = await stripeSessionStatus(o.providerRef);
    if (!s) return `${head}. Checkout id ${o.providerRef} doesn't look like a Stripe checkout.`;
    const said = `Stripe says: ${s.paid ? "PAID" : "not paid"}${s.expired ? " (expired)" : ""} · ${(s.amountMinor / 100).toFixed(2)} ${s.currency}`;
    if (o.status !== "PENDING") return `${head}. ${said}.`;
    const r = await confirmOrderWithProvider(o.userId, o.id);
    const after = await db.order.findUniqueOrThrow({ where: { id: o.id } });
    return `${head}. ${said}. Result: ${r ? r.status : "no change"} → order now ${after.status.toLowerCase()}.`;
  } catch (e) {
    return `${head}. Asking Stripe failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Admin → Integrations: the latest card orders and the last webhook outcome. */
export async function recentCardOrders() {
  const [orders, hook] = await Promise.all([
    db.order.findMany({ where: { provider: { in: ["stripe", "sandbox"] } }, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { displayName: true } } } }),
    db.appSetting.findUnique({ where: { key: "payments.lastWebhook" } }),
  ]);
  return { orders, lastWebhook: (hook?.value as { ok: boolean; at: string; error?: string; result?: string; hadSignature?: boolean } | undefined) ?? null };
}
