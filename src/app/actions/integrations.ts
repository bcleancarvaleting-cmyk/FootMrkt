"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { testSportmonksToken } from "@/providers/football/sportmonks";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { loadIntegrationState, setDataProvider } from "@/server/integrations";
import { runRebuild, startRebuild } from "@/server/rebuild";
import { deleteSecret, saveSecret } from "@/server/secrets";
import { runSportmonksCheck } from "@/server/sportmonks-check";
import { type ActionResult, attempt } from "./result";

const refresh = () => revalidatePath("/admin/integrations");

export async function saveSportmonksTokenAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const token = String(f.get("token") ?? "").trim();
  if (token.length < 20 || /\s/.test(token)) return { ok: false, error: "That doesn't look like a Sportmonks API token — copy it again from my.sportmonks.com → API → Tokens." };
  const test = await testSportmonksToken(token);
  if (!test.ok) return { ok: false, error: `Sportmonks didn't accept it: ${test.message}. Check you copied the whole token (or create a new one).` };
  await saveSecret("sportmonks", token, admin.id);
  await loadIntegrationState(true);
  refresh();
  return { ok: true, data: undefined, message: `Saved — Sportmonks recognised it. Leagues on your plan: ${test.leagues.join(", ") || "none listed"}.` };
}

export async function removeSportmonksTokenAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    await deleteSecret("sportmonks", admin.id);
    await loadIntegrationState(true);
  }, "Token removed");
  refresh();
  return res;
}

export async function runSportmonksCheckAction(): Promise<ActionResult> {
  await requireAdmin();
  const result = await runSportmonksCheck();
  await db.appSetting.upsert({
    where: { key: "sportmonks.lastCheck" },
    create: { key: "sportmonks.lastCheck", value: { at: new Date().toISOString(), ...result } },
    update: { value: { at: new Date().toISOString(), ...result } },
  });
  refresh();
  return result.passed ? { ok: true, data: undefined, message: "All checks passed — see the results below." } : { ok: false, error: "Some checks didn't pass — see the results below." };
}

export async function setSportmonksOnAction(on: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => setDataProvider(on ? "sportmonks" : "", admin.id), on ? "Data switched to Sportmonks" : "Switched back to the development data");
  revalidatePath("/", "layout");
  return res;
}

export async function rebuildFromSportmonksAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => startRebuild(admin.id), "Rebuild started — it takes several minutes. Refresh this page to follow it.");
  if (res.ok) after(() => runRebuild(admin.id));
  refresh();
  return res;
}

// ───────────── Payments & email ─────────────

const SECRET_RULES: Record<string, { label: string; ok: (v: string) => boolean; hint: string }> = {
  "stripe.secret": { label: "Stripe secret key", ok: (v) => /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/.test(v), hint: "It starts sk_live_ (or sk_test_ for a test account), from Stripe → Developers → API keys." },
  "stripe.webhook": { label: "Stripe webhook signing secret", ok: (v) => /^whsec_[A-Za-z0-9]{10,}$/.test(v), hint: "It starts whsec_, from Stripe → Developers → Webhooks → your endpoint → Signing secret." },
  "stripe.publishable": { label: "Stripe publishable key", ok: (v) => /^pk_(test|live)_[A-Za-z0-9]{10,}$/.test(v), hint: "It starts pk_live_ (or pk_test_), from Stripe → Developers → API keys." },
  resend: { label: "Resend API key", ok: (v) => /^re_[A-Za-z0-9_]{10,}$/.test(v), hint: "It starts re_, from resend.com → API Keys." },
};

export async function saveIntegrationSecretAction(name: string, _: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const rule = SECRET_RULES[name];
  if (!rule) return { ok: false, error: "Unknown key." };
  const value = String(f.get("value") ?? "").trim();
  if (!rule.ok(value)) return { ok: false, error: `That doesn't look like a ${rule.label}. ${rule.hint}` };
  if (name === "stripe.secret") {
    const res = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${value}` } }).catch(() => null);
    if (res && res.status === 401) return { ok: false, error: "Stripe didn't accept that key — copy it again from Stripe → Developers → API keys." };
  }
  await saveSecret(name, value, admin.id);
  const { loadPayments } = await import("@/server/payments/config");
  await loadPayments(true);
  refresh();
  return { ok: true, data: undefined, message: `${rule.label} saved (stored encrypted).` };
}

export async function removeIntegrationSecretAction(name: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!SECRET_RULES[name]) return { ok: false, error: "Unknown key." };
  const { loadPayments, paymentsConfig, setPaymentsMode } = await import("@/server/payments/config");
  const res = await attempt(async () => {
    await deleteSecret(name, admin.id);
    await loadPayments(true);
    // Never leave live payments on without the keys they need.
    if (name.startsWith("stripe.") && paymentsConfig().mode === "stripe" && !paymentsConfig().fromEnv) await setPaymentsMode("off", admin.id);
  }, "Removed");
  refresh();
  return res;
}

export async function setPaymentsModeAction(mode: "off" | "test" | "stripe"): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { setPaymentsMode } = await import("@/server/payments/config");
  const res = await attempt(() => setPaymentsMode(mode, admin.id), mode === "off" ? "Card payments switched off" : mode === "test" ? "Test payments on (no real money)" : "Live card payments switched on");
  revalidatePath("/", "layout");
  return res;
}

export async function saveEmailFromAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const from = String(f.get("from") ?? "").trim();
  if (!/^[^<>]{1,60}<[^@\s<>]+@[^@\s<>]+\.[a-z]{2,}>$/i.test(from) && !/^[^@\s<>]+@[^@\s<>]+\.[a-z]{2,}$/i.test(from)) {
    return { ok: false, error: 'Use an address on your verified domain, e.g. MATCHX <hello@playmatchx.com>' };
  }
  await db.appSetting.upsert({ where: { key: "email.from" }, create: { key: "email.from", value: from, updatedBy: admin.id }, update: { value: from, updatedBy: admin.id } });
  refresh();
  return { ok: true, data: undefined, message: "Sender saved." };
}

export async function sendTestEmailAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { sendEmail } = await import("@/server/email/send");
  const status = await sendEmail("test", { userId: admin.id, email: admin.email }, { name: admin.displayName });
  refresh();
  return status === "SENT"
    ? { ok: true, data: undefined, message: `Sent to ${admin.email} — check your inbox (and spam).` }
    : status === "LOGGED"
      ? { ok: false, error: "No email key saved, so it was only logged (see Admin → Emails)." }
      : { ok: false, error: "Resend refused it — see the error in Admin → Emails. Usually the sender's domain isn't verified in Resend yet." };
}
