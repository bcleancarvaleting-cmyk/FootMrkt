"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { adminDisableTwoStep, adminPasswordReset, adminSignOutEverywhere, adminVerifyEmail, blockUser, unblockUser } from "@/server/admin-users";
import { type ActionResult, attempt } from "./result";

const done = (userId: string) => revalidatePath(`/admin/users/${userId}`);

export async function blockUserAction(userId: string, _prev: unknown, form: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const r = await attempt(async () => {
    const res = await blockUser(admin.id, userId, { reason: String(form.get("reason") ?? "") });
    done(userId);
    return res;
  });
  return r.ok ? { ok: true, data: undefined, message: `Blocked and signed out${r.data.listings ? ` · ${r.data.listings} listing${r.data.listings > 1 ? "s" : ""} taken down` : ""}.` } : r;
}

export async function unblockUserAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  return attempt(async () => {
    await unblockUser(admin.id, userId);
    done(userId);
  }, "Unblocked — they can log in again.");
}

export async function passwordResetAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const r = await attempt(() => adminPasswordReset(admin.id, userId));
  return r.ok ? { ok: true, data: undefined, message: `Reset link emailed (valid 24 hours). You can also send it yourself: ${r.data}` } : r;
}

export async function verifyEmailAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  return attempt(async () => {
    await adminVerifyEmail(admin.id, userId);
    done(userId);
  }, "Email confirmed.");
}

export async function disableTwoStepAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  return attempt(async () => {
    await adminDisableTwoStep(admin.id, userId);
    done(userId);
  }, "Two-step login turned off. They can log in with just their password and set it up again.");
}

export async function signOutUserAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const r = await attempt(() => adminSignOutEverywhere(admin.id, userId));
  return r.ok ? { ok: true, data: undefined, message: `Signed out of ${r.data} device${r.data === 1 ? "" : "s"}.` } : r;
}
