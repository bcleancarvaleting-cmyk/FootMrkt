"use server";

import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/rate-limit";
import { beginTotpSetup, changePassword, confirmTotpSetup, disableTotp, regenerateBackupCodes, signOutEverywhere } from "@/server/auth/security";
import { currentSessionId, requireUser } from "@/server/auth/session";
import { type ActionResult, attempt } from "./result";

export async function changePasswordAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!rateLimit(`pw:${user.id}`, { capacity: 5, perMinute: 2 })) return { ok: false, error: "Too many tries. Please wait a minute." };
  if (f.get("next") !== f.get("confirm")) return { ok: false, error: "The two new passwords don't match." };
  const res = await attempt(async () => {
    await changePassword(user.id, String(f.get("current") ?? ""), String(f.get("next") ?? ""));
    await signOutEverywhere(user.id, await currentSessionId());
  }, "Password changed. Other devices have been logged out.");
  return res;
}

export async function beginTotpAction(): Promise<ActionResult<{ secret: string; qrSvg: string; url: string }>> {
  const user = await requireUser();
  return attempt(() => beginTotpSetup(user.id));
}

export async function confirmTotpAction(_: ActionResult<string[]> | null, f: FormData): Promise<ActionResult<string[]>> {
  const user = await requireUser();
  if (!rateLimit(`totp-setup:${user.id}`, { capacity: 6, perMinute: 3 })) return { ok: false, error: "Too many tries. Please wait a minute." };
  const res = await attempt(() => confirmTotpSetup(user.id, String(f.get("code") ?? "")));
  revalidatePath("/account/security");
  return res;
}

export async function disableTotpAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => disableTotp(user.id, String(f.get("password") ?? "")), "Two-step login is off.");
  revalidatePath("/account/security");
  return res;
}

export async function newBackupCodesAction(): Promise<ActionResult<string[]>> {
  const user = await requireUser();
  return attempt(() => regenerateBackupCodes(user.id));
}

export async function signOutOthersAction(): Promise<ActionResult> {
  const user = await requireUser();
  return attempt(async () => {
    await signOutEverywhere(user.id, await currentSessionId());
  }, "Logged out of every other device.");
}
