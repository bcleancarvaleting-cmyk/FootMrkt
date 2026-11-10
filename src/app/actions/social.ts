"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { answerQuestion } from "@/server/predictions";
import { type ActionResult, attempt } from "./result";

export async function answerPredictionAction(questionId: string, guess: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => answerQuestion(user.id, questionId, guess));
  revalidatePath("/");
  return res.ok ? { ok: true, data: undefined, message: guess ? "You said yes" : "You said no" } : res;
}

