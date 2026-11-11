import { APP_URL } from "../email/templates";
import { loadPayments, paymentsConfig } from "./config";
import { verifyStripeSignature } from "./stripe-signature";

export { verifyStripeSignature };
import type { PaymentProvider, PaymentWebhookEvent } from "./provider";

/**
 * Stripe Checkout, called over HTTPS with the secret key (no SDK). Card details never touch MATCHX:
 * the player pays on Stripe's hosted page and Stripe tells us by signed webhook.
 *
 * Needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Point the Stripe webhook at
 * https://<your domain>/api/webhooks/payments with these events:
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   checkout.session.async_payment_failed, checkout.session.expired
 * Refund through MATCHX admin (not the Stripe dashboard) so the order is updated too.
 */
const API = "https://api.stripe.com/v1";

async function stripe<T>(path: string, form?: Record<string, string>): Promise<T> {
  const key = (await loadPayments()).stripeKey;
  if (!key) throw new Error("The Stripe secret key isn't set (Admin → Integrations)");
  const res = await fetch(`${API}${path}`, {
    method: form ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe: ${body.error?.message ?? res.status}`);
  return body;
}


type Session = { id: string; amount_total: number; currency: string; payment_status: string; payment_intent: string | null };

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  async createCheckout(order) {
    const s = await stripe<Session & { url: string }>("/checkout/sessions", {
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": order.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(order.amountMinor),
      "line_items[0][price_data][product_data][name]": "MATCHX order",
      client_reference_id: order.id,
      "metadata[order_id]": order.id,
      "payment_intent_data[metadata][order_id]": order.id,
      success_url: `${APP_URL}${order.returnPath ?? "/account/wallet"}${(order.returnPath ?? "").includes("?") ? "&" : "?"}paid=${order.id}`,
      cancel_url: `${APP_URL}${order.returnPath ?? "/account/wallet"}${(order.returnPath ?? "").includes("?") ? "&" : "?"}cancelled=${order.id}`,
    });
    return { providerRef: s.id, checkoutUrl: s.url };
  },
  verifyWebhook(rawBody, signature) {
    const secret = paymentsConfig().webhookSecret;
    if (!secret) throw new Error("Invalid webhook signature (webhook signing secret not set in Admin → Integrations)");
    verifyStripeSignature(rawBody, signature, secret);
    const evt = JSON.parse(rawBody) as { id: string; type: string; data: { object: Session } };
    const s = evt.data.object;
    const base = { providerEventId: evt.id, providerRef: s.id, amountMinor: s.amount_total, currency: String(s.currency ?? "").toUpperCase() };
    switch (evt.type) {
      case "checkout.session.completed":
        // Card payments are paid at once; bank-based methods finish later (async_payment_succeeded).
        return { ...base, type: s.payment_status === "paid" ? "payment.succeeded" : "payment.ignored" } as PaymentWebhookEvent;
      case "checkout.session.async_payment_succeeded":
        return { ...base, type: "payment.succeeded" };
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired":
        return { ...base, type: "payment.failed" };
      default:
        return { ...base, type: "payment.ignored" };
    }
  },
  async refund(providerRef, amountMinor) {
    const s = await stripe<Session>(`/checkout/sessions/${providerRef}`);
    if (!s.payment_intent) throw new Error("Stripe: nothing to refund for this session");
    await stripe("/refunds", { payment_intent: s.payment_intent, amount: String(amountMinor) });
  },
};

/** Ask Stripe directly how a Checkout Session stands (used when a webhook hasn't arrived). */
export async function stripeSessionStatus(sessionId: string) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return null;
  const s = await stripe<Session & { status?: string }>(`/checkout/sessions/${sessionId}`);
  return { paid: s.payment_status === "paid", expired: s.status === "expired", amountMinor: s.amount_total, currency: String(s.currency ?? "").toUpperCase() };
}
