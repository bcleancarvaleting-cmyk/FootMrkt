import { db } from "./db";
import { DomainError } from "./errors";
import { requireFlag } from "./flags";
import { type PaymentProvider, paymentProvider } from "./payments/provider";
import { assertCanSpend } from "./safer-play";
import { fmtMp, isAdult } from "./wallet";

/**
 * "Pay exactly £x by card" (product decision 13 Nov 2026): instead of a bundle, pay the exact price
 * of what you're buying — £1.24 or £17.99. The card money is MATCHX's; once Stripe confirms it, the
 * same amount lands in the buyer's balance and the purchase completes on its own, through the normal
 * sale (so on the Transfer list the seller gets the price minus the 5% fee). If someone else signs
 * the player first, the money stays in the buyer's balance and they're told.
 */
export type ExactTarget = { kind: "listing" | "auction" | "basket"; id?: string };

export async function startExactPayment(userId: string, target: ExactTarget, clientKey: string, given?: PaymentProvider) {
  await requireFlag("DEPOSITS");
  const { requireCardPayments } = await import("./payments/config");
  await requireCardPayments();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!isAdult(user.dateOfBirth)) throw new DomainError("AGE", "Add your date of birth in My Account → Profile. You must be 18 or over to pay by card.");

  let amountMinor = 0;
  let what = "";
  let back = "/transfers/paid";
  if (target.kind === "listing") {
    const l = await db.marketListing.findUnique({ where: { id: target.id ?? "" }, include: { card: { include: { template: { include: { player: true } } } } } });
    if (!l || l.status !== "ACTIVE" || l.expiresAt <= new Date()) throw new DomainError("NOT_AVAILABLE", "This player is no longer for sale.");
    if (l.sellerId === userId) throw new DomainError("OWN_LISTING", "You can't buy your own listing.");
    amountMinor = l.askingPriceMinor;
    what = l.card.template.player.displayName;
    back = `/transfers/paid?listing=${l.id}`;
  } else if (target.kind === "auction") {
    const a = await db.auction.findUnique({ where: { id: target.id ?? "" }, include: { card: { include: { template: { include: { player: true } } } } } });
    if (!a || a.status !== "LIVE" || a.endsAt <= new Date() || a.buyNowMinor === null) throw new DomainError("CLOSED", "This auction can't be bought outright any more.");
    if (a.sellerId === userId) throw new DomainError("OWN_AUCTION", "You can't buy your own auction.");
    amountMinor = a.buyNowMinor;
    what = a.card.template.player.displayName;
    back = `/transfers/paid?auction=${a.id}`;
  } else {
    const { basketView } = await import("./basket");
    const v = await basketView(userId);
    if (!v.rows.length) throw new DomainError("EMPTY", "Your basket is empty.");
    amountMinor = v.totalMinor;
    what = `${v.rows.length} player${v.rows.length > 1 ? "s" : ""}`;
    back = "/transfers/paid?basket=1";
  }
  if (amountMinor < 30) throw new DomainError("TOO_SMALL", "Card payments start at 30p — add funds instead.");
  await assertCanSpend(userId, amountMinor);
  const provider = given ?? paymentProvider();
  const idempotencyKey = `exact:${userId}:${clientKey}`;
  const ref = `buy:${target.kind}:${target.kind === "basket" ? userId : target.id}`;
  const existing = await db.order.findUnique({ where: { idempotencyKey } });
  const order = existing ?? (await db.order.create({ data: { userId, kind: "DEPOSIT", refId: ref, amountMinor, provider: provider.name, idempotencyKey } }));
  const checkout = await provider.createCheckout({ id: order.id, amountMinor, currency: order.currency, returnPath: back, name: `MATCHX · ${what} · ${fmtMp(amountMinor)}` });
  if (!order.providerRef) await db.order.update({ where: { id: order.id }, data: { providerRef: checkout.providerRef } });
  return { orderId: order.id, checkoutUrl: checkout.checkoutUrl };
}

/** After an exact card payment is credited: complete the purchase it was for. Runs once per order. */
export async function completeExactPurchase(order: { id: string; userId: string; amountMinor: number; refId: string }) {
  const m = /^buy:(listing|auction|basket):(.+)$/.exec(order.refId);
  if (!m) return;
  const [, kind, id] = m;
  try {
    if (kind === "listing") await (await import("./transfers")).buyNow(order.userId, id);
    else if (kind === "auction") await (await import("./transfers")).buyNowAuction(order.userId, id);
    else await (await import("./basket")).checkoutBasket(order.userId);
  } catch (e) {
    const { notify } = await import("./notifications");
    await notify(order.userId, {
      kind: "PACK",
      title: "Payment received — it's in your balance",
      body: `${fmtMp(order.amountMinor)} is in your balance: ${e instanceof DomainError ? e.message : "the purchase couldn't complete"}`,
      href: "/transfers",
      dedupeKey: `exact-miss:${order.id}`,
    }).catch(() => {});
  }
}
