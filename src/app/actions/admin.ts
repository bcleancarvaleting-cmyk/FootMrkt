"use server";

import { revalidatePath } from "next/cache";
import { FLAG_DEFINITIONS, type FlagKey } from "@/config/flags";
import { requireAdmin, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { isEnabled, setFlag } from "@/server/flags";
import {
  createGameweek,
  finaliseGameweek,
  footballSport,
  lockGameweek,
  runScheduledJobs,
  simulateCorrections,
  simulateFixturesNow,
} from "@/server/gameweeks";
import { expireListings, handlePaymentWebhook } from "@/server/market";
import { signSandbox } from "@/server/payments/provider";
import { executeDueReleases, executeRelease, updateRelease } from "@/server/supply";
import { revalueAll } from "@/server/valuation";
import { type ActionResult, attempt } from "./result";

function done() {
  revalidatePath("/", "layout");
}

export async function createNextGameweekAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    const sport = await footballSport();
    const last = await db.gameweek.findFirst({ where: { sportId: sport.id }, orderBy: [{ season: "desc" }, { number: "desc" }] });
    const now = new Date();
    await createGameweek({
      season: last?.season ?? "2026-27",
      number: (last?.number ?? 0) + 1,
      opensAt: now,
      firstKickoffAt: new Date(now.getTime() + 3 * 24 * 3600_000),
      actorId: admin.id,
    });
  }, "Gameweek created");
  done();
  return res;
}

export async function lockGameweekAction(gameweekId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => lockGameweek(gameweekId, admin.id), "Gameweek locked");
  done();
  return res;
}

export async function simulateAction(gameweekId: string, count: number | "all"): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    const r = await simulateFixturesNow(gameweekId, count, admin.id);
    return `${r.fixtures} fixture(s) played · ${r.applied} events applied · ${r.duplicates} duplicates ignored`;
  });
  done();
  return res.ok ? { ...res, data: undefined, message: res.data } : res;
}

export async function correctionsAction(gameweekId: string): Promise<ActionResult> {
  await requireAdmin();
  const res = await attempt(async () => {
    const r = await simulateCorrections(gameweekId, 3);
    return `${r.applied} correction(s) applied`;
  });
  done();
  return res.ok ? { ...res, data: undefined, message: res.data } : res;
}

export async function finaliseAction(gameweekId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => finaliseGameweek(gameweekId, admin.id), "Gameweek settled · rewards granted · MP revalued");
  done();
  return res;
}

export async function runJobsAction(): Promise<ActionResult> {
  await requireAdmin();
  const res = await attempt(async () => {
    const w = await runScheduledJobs();
    const releases = await executeDueReleases();
    const expired = await expireListings();
    return `Windows: ${w.opened} opened, ${w.locked} locked · ${releases.length} release(s) · ${expired} listing(s) expired`;
  });
  done();
  return res.ok ? { ...res, data: undefined, message: res.data } : res;
}

export async function revalueAction(): Promise<ActionResult> {
  await requireAdmin();
  const res = await attempt(async () => {
    const r = await revalueAll();
    return `${r.written} valuation(s) changed across ${r.templates} card designs`;
  });
  done();
  return res.ok ? { ...res, data: undefined, message: res.data } : res;
}

export async function setFlagAction(key: string, enabled: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!(key in FLAG_DEFINITIONS)) return { ok: false, error: "Unknown flag" };
  const res = await attempt(() => setFlag(admin.id, key as FlagKey, enabled), "Flag updated");
  done();
  return res;
}

export async function releaseAction(releaseId: string, op: "execute" | "pause" | "resume" | "cancel"): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    if (op === "execute") {
      const r = await executeRelease(releaseId, admin.id);
      return `Minted ${r.minted} card(s)`;
    }
    await updateRelease(releaseId, { status: op === "pause" ? "PAUSED" : op === "resume" ? "SCHEDULED" : "CANCELLED" }, admin.id);
    return "Release updated";
  });
  done();
  return res.ok ? { ...res, data: undefined, message: res.data } : res;
}

/** DEV sandbox checkout: simulate the provider calling our webhook after a successful payment. */
export async function sandboxPayAction(orderId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    if (!(await isEnabled("DEV_TOOLS"))) throw new DomainError("FEATURE_DISABLED", "Sandbox checkout is disabled.");
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== user.id) throw new DomainError("NOT_FOUND", "Order not found.");
    const body = JSON.stringify({
      providerEventId: `sbx_evt_${order.id}`,
      type: "payment.succeeded",
      providerRef: order.providerRef,
      amountMinor: order.amountMinor,
      currency: order.currency,
    });
    const r = await handlePaymentWebhook(body, signSandbox(body));
    return r.status;
  });
  done();
  return res.ok ? { ...res, data: undefined, message: `Payment ${res.data}` } : res;
}
