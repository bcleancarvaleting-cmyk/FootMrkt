"use server";

import { revalidatePath } from "next/cache";
import { FLAG_DEFINITIONS, type FlagKey } from "@/config/flags";
import { requireAdmin, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { isEnabled, setFlag } from "@/server/flags";
import {
  createGameweek,
  deleteGameweek,
  finaliseGameweek,
  footballSport,
  lockGameweek,
  runScheduledJobs,
  simulateCorrections,
  simulateFixturesNow,
} from "@/server/gameweeks";
import { handlePaymentWebhook } from "@/server/market";
import { expireListings, settleAuctions } from "@/server/transfers";
import { grantAllDueWelcomePacks } from "@/server/welcome";
import { signSandbox } from "@/server/payments/provider";
import { executeDueReleases, executeRelease, updateRelease } from "@/server/supply";
import { revalueAll } from "@/server/valuation";
import { currentSeason, nextGameweekNumber } from "@/server/season";
import { type ActionResult, attempt } from "./result";

function done() {
  revalidatePath("/", "layout");
}

export async function createNextGameweekAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    const season = await currentSeason();
    const now = new Date();
    await createGameweek({
      season,
      number: await nextGameweekNumber(season),
      opensAt: now,
      firstKickoffAt: new Date(now.getTime() + 3 * 24 * 3600_000),
      actorId: admin.id,
    });
  }, "Gameweek created");
  done();
  return res;
}

export async function removeMatchAction(competitionId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { removeCompetition } = await import("@/server/competitions");
  const r = await attempt(() => removeCompetition(admin.id, competitionId));
  done();
  return r.ok ? { ok: true, data: undefined, message: r.data ? `Match removed — ${r.data} entr${r.data > 1 ? "ies" : "y"} refunded and told.` : "Match removed." } : r;
}

export async function deleteGameweekAction(gameweekId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => deleteGameweek(admin.id, gameweekId), "Gameweek deleted");
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
  const res = await attempt(() => finaliseGameweek(gameweekId, admin.id), "Gameweek settled · rewards granted · players revalued");
  done();
  return res;
}

export async function runJobsAction(): Promise<ActionResult> {
  await requireAdmin();
  const res = await attempt(async () => {
    const w = await runScheduledJobs();
    const releases = await executeDueReleases();
    const expired = await expireListings();
    const auctions = await settleAuctions();
    const welcome = await grantAllDueWelcomePacks();
    return `Windows: ${w.opened} opened, ${w.locked} locked · ${releases.length} release(s) · ${expired} listing(s) expired · ${auctions} auction(s) closed · ${welcome} welcome pack(s)`;
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
export async function sandboxPayAction(orderId: string, outcome: "succeeded" | "failed" = "succeeded"): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    if (!(await isEnabled("DEV_TOOLS"))) throw new DomainError("FEATURE_DISABLED", "Sandbox checkout is disabled.");
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== user.id) throw new DomainError("NOT_FOUND", "Order not found.");
    const body = JSON.stringify({
      providerEventId: `sbx_evt_${order.id}_${outcome}`,
      type: `payment.${outcome}`,
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

export async function runSquadSyncAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { loadIntegrationState } = await import("@/server/integrations");
  const { liveDataReady, liveSource, syncSquads } = await import("@/server/live-data");
  await loadIntegrationState(true);
  if (!liveDataReady() || liveSource().name !== "sportmonks") return { ok: false, error: "Squad sync needs Sportmonks switched on (Admin → Integrations)." };
  const r = await attempt(() => syncSquads(admin.id));
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, data: undefined, message: `Done: ${r.data.moved} moved · ${r.data.added} new players · ${r.data.missing} no longer in an English squad.` } : r;
}

/** Show the admin the transfer-news pop-up with one of their own cards (nothing is moved). */
export async function previewTransferNoticeAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const card =
    (await db.cardInstance.findFirst({ where: { ownerId: admin.id }, include: { template: { include: { player: { include: { club: true } } } } } })) ??
    (await db.cardInstance.findFirst({ include: { template: { include: { player: { include: { club: true } } } } } }));
  if (!card) return { ok: false, error: "No cards in the game yet." };
  const to = await db.club.findFirst({ where: { id: { not: card.template.player.clubId ?? undefined }, league: { isTopFlight: true } }, orderBy: { name: "asc" } });
  const { notify } = await import("@/server/notifications");
  const p = card.template.player;
  await notify(admin.id, {
    kind: "TRANSFER",
    title: `🔁 Preview: ${p.displayName} has moved to ${to?.name ?? "Manchester City"}`,
    body: "Preview of the transfer news pop-up — nothing has moved.",
    href: `/cards/${card.id}`,
    dedupeKey: `move-preview:${admin.id}:${Date.now()}`,
    data: { player: p.displayName, from: p.club?.name ?? "Free agent", to: to?.name ?? "Manchester City", fee: "€65m", type: "Transfer", date: new Date().toISOString(), cardId: card.id, playerId: p.id },
  });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined, message: "Preview sent — it pops up now (and on your next page)." };
}

export async function resolveErrorAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  await db.errorLog.updateMany({ where: { id }, data: { resolvedAt: new Date() } });
  revalidatePath("/admin/errors");
  return { ok: true, data: undefined, message: "Marked fixed" };
}

export async function resolveAllErrorsAction(): Promise<ActionResult> {
  await requireAdmin();
  const r = await db.errorLog.updateMany({ where: { resolvedAt: null }, data: { resolvedAt: new Date() } });
  revalidatePath("/admin/errors");
  return { ok: true, data: undefined, message: `${r.count} marked fixed` };
}

export async function loadGameweeksAheadAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => (await import("@/server/live-data")).ensureGameweeksAhead(4, new Date(), admin.id));
  done();
  if (!res.ok) return res;
  const r = res.data as { created: number; added?: number };
  return { ok: true, data: undefined, message: r.created || r.added ? `${r.created} gameweek${r.created === 1 ? "" : "s"} added${r.added ? `, ${r.added} fixtures added to loaded weeks` : ""}` : "Already loaded 4 weeks ahead" };
}

export async function removeAutoMatchesAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => (await import("@/server/competitions")).removeAutoMatches(admin.id));
  done();
  return res.ok ? { ok: true, data: undefined, message: `${res.data} automatic match${res.data === 1 ? "" : "es"} removed` } : res;
}
