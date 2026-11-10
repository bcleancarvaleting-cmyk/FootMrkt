"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/server/auth/session";
import { markFind } from "@/server/social";
import { createLeague, joinLeague, leaveLeague } from "@/server/leagues";
import { unwatchPlayer, watchPlayer } from "@/server/watchlist";
import { answerQuestion } from "@/server/predictions";
import { type ActionResult, attempt } from "./result";

export async function answerPredictionAction(questionId: string, guess: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => answerQuestion(user.id, questionId, guess));
  revalidatePath("/");
  return res.ok ? { ok: true, data: undefined, message: guess ? "You said yes" : "You said no" } : res;
}


export async function createLeagueAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => createLeague(user.id, form.get("name")));
  if (!res.ok) return res;
  revalidatePath("/leagues");
  redirect(`/leagues/${res.data.id}`);
}

export async function joinLeagueAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => joinLeague(user.id, String(form.get("code") ?? "")));
  if (!res.ok) return res;
  revalidatePath("/leagues");
  redirect(`/leagues/${res.data.id}`);
}

export async function leaveLeagueAction(leagueId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => leaveLeague(user.id, leagueId));
  if (!res.ok) return res;
  revalidatePath("/leagues");
  redirect("/leagues");
}

export async function toggleWatchAction(playerId: string, watch: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    if (watch) await watchPlayer(user.id, playerId);
    else await unwatchPlayer(user.id, playerId);
  });
  revalidatePath("/account/watchlist");
  return res.ok ? { ok: true, data: undefined, message: watch ? "Watching — we'll tell you when they drop or get listed" : "Removed from your watchlist" } : res;
}

export async function setAlertPriceAction(playerId: string, _: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const raw = String(form.get("price") ?? "").trim();
  const minor = raw ? Math.round(Number(raw) * 100) : null;
  const res = await attempt(async () => {
    await watchPlayer(user.id, playerId, minor === null ? null : Number.isFinite(minor) ? minor : NaN);
  });
  revalidatePath("/account/watchlist");
  return res.ok ? { ok: true, data: undefined, message: minor ? "Alert price saved" : "Alert on any listing" } : res;
}

export async function markFindAction(id: string, status: "POSTED" | "SKIPPED"): Promise<ActionResult> {
  await requireAdmin();
  const res = await attempt(() => markFind(id, status), status === "POSTED" ? "Marked as posted" : "Skipped");
  revalidatePath("/admin/social");
  return res;
}
