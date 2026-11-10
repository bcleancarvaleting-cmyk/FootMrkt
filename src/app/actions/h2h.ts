"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { challenge, respond } from "@/server/h2h";
import { type ActionResult, attempt } from "./result";

export async function challengeAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const name = String(f.get("opponent") ?? "");
  const res = await attempt(async () => {
    await challenge(user.id, name);
  }, `Challenge sent to ${name.trim()}`);
  revalidatePath("/h2h");
  return res;
}

export async function challengeByNameAction(name: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await challenge(user.id, name);
  }, "Challenge sent — they'll get a notification");
  revalidatePath("/h2h");
  return res;
}

export async function respondAction(id: string, accept: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => respond(user.id, id, accept), accept ? "Accepted — game on" : "Declined");
  revalidatePath("/h2h");
  return res;
}
