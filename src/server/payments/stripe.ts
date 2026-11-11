import { createHmac, timingSafeEqual } from "node:crypto";
import { APP_URL } from "../email/templates";
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
const TOLERANCE_S = 300;

async function stripe<T>(path: string, form?: Record<string, string>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    method: form ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const body = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe: ${body.error?.message ?? res.status}`);
  return body;
}

/** Verify a Stripe-Signature header ("t=…,v1=…") against the raw body. */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowS = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  const sigs = (header ?? "").split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length) throw new Error("Invalid webhook signature");
  if (Math.abs(nowS - t) > TOLERANCE_S) throw new Error("Invalid webhook signature (too old)");
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const ok = sigs.some((s) => {
    const given = Buffer.from(s, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new Error("Invalid webhook signature");
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
      cancel_url: `${APP_URL}/account/wallet?cancelled=${order.id}`,
    });
    return { providerRef: s.id, checkoutUrl: s.url };
  },
  verifyWebhook(rawBody, signature) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("Invalid webhook signature (STRIPE_WEBHOOK_SECRET not set)");
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
