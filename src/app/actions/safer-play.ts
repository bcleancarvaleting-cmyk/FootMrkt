"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, requireUser } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { pauseAccount, setLimits, setRealityCheck } from "@/server/safer-play";
import { type ActionResult, attempt } from "./result";

const pounds = (f: FormData, k: string) => {
  const raw = String(f.get(k) ?? "").trim();
  if (raw === "") return null;
  const n = Math.round(Number(raw) * 100);
  if (!Number.isFinite(n)) throw new DomainError("LIMIT", "Enter amounts in pounds, e.g. 25");
  return n;
};

export async function setLimitsAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    const r = await setLimits(user.id, { daily: pounds(f, "daily"), weekly: pounds(f, "weekly"), monthly: pounds(f, "monthly") });
    return r;
  });
  revalidatePath("/account/safer-play");
  if (!res.ok) return res;
  return { ok: true, data: undefined, message: res.data.waits ? "Saved. Lower limits apply now; higher or removed limits apply in 24 hours." : "Limits saved — they apply now." };
}

export async function realityCheckAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => setRealityCheck(user.id, Number(f.get("minutes"))), "Reality check saved");
  revalidatePath("/", "layout");
  return res;
}

export async function pauseAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const kind = f.get("kind") === "exclusion" ? "exclusion" : "timeout";
  if (f.get("confirm") !== "on") return { ok: false, error: "Tick the box to confirm." };
  const res = await attempt(() => pauseAccount(user.id, kind, String(f.get("length") ?? "")));
  if (!res.ok) return res;
  await endSession();
  redirect(`/login?paused=${kind}`);
}
