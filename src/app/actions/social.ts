"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { createLeague, joinLeague, leaveLeague } from "@/server/leagues";
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
