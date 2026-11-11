"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { completeChallenge } from "@/server/challenges";
import { db } from "@/server/db";
import { claimDrop } from "@/server/drops";
import { saveClub } from "@/server/club";
import { discardLoan } from "@/server/loans";
import { choosePick, isPick } from "@/server/picks";
import { DomainError } from "@/server/errors";
import { convertXp, fmtMp, isAdult, requestWithdrawal, startDeposit } from "@/server/wallet";
import { type ActionResult, attempt } from "./result";

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const ProfileSchema = z.object({
  fullName: opt(80),
  dateOfBirth: z
    .string()
    .trim()
    .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null))
    .refine((d) => d === null || (!Number.isNaN(d.getTime()) && d.getUTCFullYear() > 1900 && d < new Date()), "Enter a valid date of birth"),
  addressLine1: opt(120),
  addressLine2: opt(120),
  city: opt(60),
  postcode: opt(10).refine((v) => v === null || /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(v), "Enter a valid UK postcode"),
  country: opt(60),
  phone: opt(20).refine((v) => v === null || /^[+\d][\d\s]{6,18}$/.test(v), "Enter a valid phone number"),
  marketingOptIn: z.boolean(),
  weeklyDigest: z.boolean(),
});

export async function updateProfileAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    const data = ProfileSchema.parse({
      fullName: String(form.get("fullName") ?? ""),
      dateOfBirth: String(form.get("dateOfBirth") ?? ""),
      addressLine1: String(form.get("addressLine1") ?? ""),
      addressLine2: String(form.get("addressLine2") ?? ""),
      city: String(form.get("city") ?? ""),
      postcode: String(form.get("postcode") ?? ""),
      country: String(form.get("country") ?? ""),
      phone: String(form.get("phone") ?? ""),
      marketingOptIn: form.get("marketingOptIn") === "on",
      weeklyDigest: form.get("weeklyDigest") === "on",
    });
    const current = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    // Once identity is verified for withdrawals, name and date of birth can only change via support.
    if (current.kycStatus === "VERIFIED" && (data.fullName !== current.fullName || data.dateOfBirth?.getTime() !== current.dateOfBirth?.getTime())) {
      throw new DomainError("LOCKED", "Your name and date of birth are verified — contact support to change them.");
    }
    if (data.dateOfBirth && !isAdult(data.dateOfBirth)) throw new DomainError("AGE", "MATCHX is for over-18s only.");
    await db.user.update({ where: { id: user.id }, data });
  }, "Profile saved");
  revalidatePath("/account", "layout");
  return res;
}

export async function depositAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() =>
    startDeposit(
      user.id,
      { bundle: String(form.get("bundle") ?? ""), acceptTerms: form.get("acceptTerms") === "on", acceptRisk: form.get("acceptRisk") === "on" } as never,
      String(form.get("clientKey")),
      undefined,
      String(form.get("returnTo") ?? "") || undefined,
    ),
  );
  if (!res.ok) return res;
  redirect(res.data.checkoutUrl);
}

export async function withdrawAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await requestWithdrawal(user.id, Math.round(Number(form.get("amount")) * 100));
  }, "Withdrawal requested — we'll check your details and pay out to your bank, usually within 3 working days.");
  revalidatePath("/account", "layout");
  return res;
}

export async function completeChallengeAction(challengeId: string, cardIds: string[], key: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await completeChallenge(user.id, challengeId, cardIds, key);
  }, "Challenge complete — reward added");
  revalidatePath("/", "layout");
  return res;
}

export async function claimDropAction(dropId: string): Promise<ActionResult<{ entitlementId: string | null; pick: boolean }>> {
  const user = await requireUser();
  const res = await attempt(async () => {
    const r = await claimDrop(user.id, dropId);
    if (r.kind !== "PACK") return { entitlementId: null, pick: false, label: r.label };
    return { entitlementId: r.entitlement.id, pick: isPick(r.skuCode), label: r.label };
  }, "Gift claimed");
  revalidatePath("/", "layout");
  return res;
}

export async function convertXpAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => convertXp(user.id, Number(form.get("xp"))));
  revalidatePath("/", "layout");
  return res.ok ? { ok: true, data: undefined, message: `Swapped ${res.data.xpUsed} XP for ${fmtMp(res.data.mxMinor)}` } : res;
}

export async function saveClubAction(input: { clubName: string; crest: unknown }): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => saveClub(user.id, input));
  revalidatePath("/", "layout");
  return res.ok ? { ok: true, data: undefined, message: "Club saved" } : res;
}

export async function discardLoanAction(cardId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => discardLoan(user.id, cardId));
  revalidatePath("/", "layout");
  return res.ok ? { ok: true, data: undefined, message: "Loan player sent back to their club" } : res;
}

export async function choosePickAction(entitlementId: string, playerIds: string | string[]): Promise<ActionResult<{ openingId: string }>> {
  const user = await requireUser();
  const ids = (Array.isArray(playerIds) ? playerIds : [playerIds]).filter((x) => typeof x === "string").slice(0, 10);
  const res = await attempt(async () => ({ openingId: (await choosePick(user.id, entitlementId, ids)).openingId }));
  revalidatePath("/", "layout");
  return res;
}


export async function acceptTransferNewsAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const { acceptNotification } = await import("@/server/notifications");
  await acceptNotification(user.id, id);
  revalidatePath("/notifications");
  return { ok: true, data: undefined };
}

export async function finishTourAction(): Promise<ActionResult> {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { tourSeenAt: new Date() } });
  return { ok: true, data: undefined };
}

export async function restartTourAction(): Promise<ActionResult> {
  const user = await requireUser();
  await db.user.update({ where: { id: user.id }, data: { tourSeenAt: null } });
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
