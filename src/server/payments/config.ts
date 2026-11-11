import { audit } from "../audit";
import { db } from "../db";
import { DomainError } from "../errors";
import { readSecret } from "../secrets";

/**
 * Card payments switch (product decision 11 Nov 2026), set in Admin → Integrations:
 *   off    — every £ button shows "coming soon" and no checkout can start;
 *   test   — the built-in test checkout (no real money; needs Dev tools on, for the test site);
 *   stripe — real card payments through Stripe Checkout (needs the Stripe keys).
 * PAYMENTS_PROVIDER on the server ("stripe" or "sandbox") is the starting value; the switch overrides it. The legal-gated
 * flags (Paid packs, Add funds) still have to be on as well — see `cardPaymentsStatus`.
 */
export type PaymentsMode = "off" | "test" | "stripe";
const MODE_KEY = "payments.mode";

type Cfg = { mode: PaymentsMode; fromEnv: boolean; stripeKey: string | null; publishableKey: string | null; webhookSecret: string | null; at: number };
let cfg: Cfg = { mode: "off", fromEnv: false, stripeKey: null, publishableKey: null, webhookSecret: null, at: 0 };

function envMode(): PaymentsMode | null {
  const p = process.env.PAYMENTS_PROVIDER;
  if (p === "stripe") return "stripe";
  if (p === "sandbox") return "test";
  return null;
}

export async function loadPayments(force = false): Promise<Cfg> {
  if (!force && Date.now() - cfg.at < 30_000) return cfg;
  const row = await db.appSetting.findUnique({ where: { key: MODE_KEY } }).catch(() => null);
  const stored = row?.value === "test" || row?.value === "stripe" || row?.value === "off" ? (row.value as PaymentsMode) : null;
  const env = envMode();
  cfg = {
    mode: stored ?? env ?? "off",
    fromEnv: !stored && !!env,
    stripeKey: process.env.STRIPE_SECRET_KEY || (await readSecret("stripe.secret")),
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || (await readSecret("stripe.publishable")),
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || (await readSecret("stripe.webhook")),
    at: Date.now(),
  };
  return cfg;
}

/** The last loaded config (call `loadPayments()` first in anything that relies on it). */
export const paymentsConfig = () => cfg;

export async function setPaymentsMode(mode: PaymentsMode, actorId: string | null) {
  if (mode === "stripe") {
    const c = await loadPayments(true);
    if (!c.stripeKey || !c.webhookSecret) throw new DomainError("STRIPE_KEYS", "Save the Stripe secret key and webhook signing secret first.");
  }
  await db.appSetting.upsert({ where: { key: MODE_KEY }, create: { key: MODE_KEY, value: mode, updatedBy: actorId }, update: { value: mode, updatedBy: actorId } });
  await audit(db, { actorId, action: "payments.mode", entityType: "Setting", entityId: MODE_KEY, after: { mode } });
  await loadPayments(true);
}

/** Whether a card checkout can actually start right now, and if not, why (for buttons and admin). */
export async function cardPaymentsReady(): Promise<{ ready: boolean; reason: string | null; mode: PaymentsMode }> {
  const c = await loadPayments();
  if (c.mode === "off") return { ready: false, reason: "Card payments are switched off in Admin → Integrations.", mode: c.mode };
  if (c.mode === "stripe" && (!c.stripeKey || !c.webhookSecret)) return { ready: false, reason: "Stripe keys are missing.", mode: c.mode };
  if (c.mode === "test") {
    const { isEnabled } = await import("../flags");
    if (!(await isEnabled("DEV_TOOLS"))) return { ready: false, reason: "Test payments need Dev tools switched on (Admin → Flags).", mode: c.mode };
  }
  return { ready: true, reason: null, mode: c.mode };
}

export async function requireCardPayments() {
  const r = await cardPaymentsReady();
  if (!r.ready) throw new DomainError("PAYMENTS_OFF", "Card payments aren't available yet — coming soon.");
}
