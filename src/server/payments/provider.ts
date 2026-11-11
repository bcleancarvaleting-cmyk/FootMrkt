import { createHmac, timingSafeEqual } from "node:crypto";
import { paymentsConfig } from "./config";
import { stripeProvider } from "./stripe";

/**
 * Payment-provider abstraction (spec §11). No card details are ever handled by MATCHX.
 * BLOCKER: no provider is approved for this business model (spec §9.3). Only a sandbox exists.
 */
export interface PaymentWebhookEvent {
  providerEventId: string;
  type: "payment.succeeded" | "payment.failed" | "payment.refunded" | "payment.ignored";
  providerRef: string;
  amountMinor: number;
  currency: string;
}

export interface PaymentProvider {
  readonly name: string;
  /** returnPath: where to send the player after paying (a path on this site, e.g. back to a match). */
  createCheckout(order: { id: string; amountMinor: number; currency: string; returnPath?: string }): Promise<{ providerRef: string; checkoutUrl: string }>;
  /** Verify signature and parse. Throws on an invalid signature. */
  verifyWebhook(rawBody: string, signature: string | null): PaymentWebhookEvent;
  refund(providerRef: string, amountMinor: number): Promise<void>;
}

function sandboxSecret() {
  return process.env.PAYMENTS_SANDBOX_SECRET ?? "sandbox-dev-secret";
}

export function signSandbox(rawBody: string): string {
  return createHmac("sha256", sandboxSecret()).update(rawBody).digest("hex");
}

/** DEV/TEST sandbox: checkout is a local page; webhooks are HMAC-signed JSON. */
export const sandboxProvider: PaymentProvider = {
  name: "sandbox",
  async createCheckout(order) {
    return { providerRef: `sbx_${order.id}`, checkoutUrl: `/dev/checkout/${order.id}${order.returnPath ? `?next=${encodeURIComponent(order.returnPath)}` : ""}` };
  },
  verifyWebhook(rawBody, signature) {
    const expected = Buffer.from(signSandbox(rawBody), "hex");
    const given = Buffer.from(signature ?? "", "hex");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new Error("Invalid webhook signature");
    return JSON.parse(rawBody) as PaymentWebhookEvent;
  },
  async refund() {
    /* sandbox: nothing to do */
  },
};

/** The provider for the payments switch (Admin → Integrations): "stripe" for live, else the sandbox. */
export function paymentProvider(name = paymentsConfig().mode === "stripe" ? "stripe" : "sandbox"): PaymentProvider {
  if (name === "sandbox") return sandboxProvider;
  if (name === "stripe") return stripeProvider;
  throw new Error(`Unknown payment provider ${name}`);
}

/** The signature header each provider sends with its webhooks. */
export function signatureHeader(name = paymentsConfig().mode === "stripe" ? "stripe" : "sandbox") {
  return name === "stripe" ? "stripe-signature" : "x-sandbox-signature";
}
