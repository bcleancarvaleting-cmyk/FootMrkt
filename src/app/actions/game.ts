"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { completeSet } from "@/server/collections";
import { submitEntry, withdrawEntry } from "@/server/competitions";
import { db, withTx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { isEnabled } from "@/server/flags";
import { startPackPurchase } from "@/server/market";
import { grantPack, openPack } from "@/server/packs";
import { buyPackWithCredit } from "@/server/wallet";
import { claimWeeklyPack } from "@/server/weekly";
import { rateLimit } from "@/lib/rate-limit";
import { type ActionResult, attempt } from "./result";

export async function openPackAction(entitlementId: string): Promise<ActionResult<{ openingId: string }>> {
  const user = await requireUser();
  if (!rateLimit(`open:${user.id}`, { capacity: 10, perMinute: 20 })) return { ok: false, error: "Slow down a little!" };
  const res = await attempt(async () => ({ openingId: (await openPack(user.id, entitlementId)).openingId }));
  revalidatePath("/", "layout");
  return res;
}

/** DEV ONLY: free packs for play-testing. Disabled unless DEV_TOOLS is on. */
export async function claimDevPackAction(skuCode: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    if (!(await isEnabled("DEV_TOOLS"))) throw new DomainError("FEATURE_DISABLED", "Dev tools are disabled.");
    await withTx((tx) => grantPack(tx, { userId: user.id, skuCode, source: "DEV", sourceRef: `dev:${user.id}:${randomUUID()}` }));
  }, "Dev pack added");
  revalidatePath("/", "layout");
  return res;
}

export async function buyPackAction(skuCode: string, clientKey: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => startPackPurchase(user.id, skuCode, clientKey));
  if (!res.ok) return res;
  redirect(res.data.checkoutUrl);
}

export async function submitEntryAction(competitionId: string, submission: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await submitEntry(user.id, competitionId, submission);
  }, "Squad saved");
  revalidatePath(`/competitions/${competitionId}`);
  revalidatePath("/matches");
  return res;
}

export async function withdrawEntryAction(competitionId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => withdrawEntry(user.id, competitionId), "Entry withdrawn");
  revalidatePath(`/competitions/${competitionId}`);
  return res;
}

export async function toggleFavouriteAction(cardId: string): Promise<ActionResult> {
  const user = await requireUser();
  return attempt(async () => {
    const card = await db.cardInstance.findUnique({ where: { id: cardId } });
    if (!card || card.ownerId !== user.id) throw new DomainError("NOT_OWNER", "You don't own this card.");
    const key = { userId_cardId: { userId: user.id, cardId } };
    if (await db.favouriteCard.findUnique({ where: key })) await db.favouriteCard.delete({ where: key });
    else await db.favouriteCard.create({ data: { userId: user.id, cardId } });
    revalidatePath(`/cards/${cardId}`);
  });
}

export async function completeSetAction(setId: string, idempotencyKey: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    const c = await completeSet(user.id, setId, idempotencyKey);
    return db.collectionSet.findUniqueOrThrow({ where: { id: c.setId }, select: { name: true } });
  });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  redirect(`/account/challenges?completed=${encodeURIComponent(res.data.name)}`);
}

export async function buyPackWithCreditAction(skuCode: string, clientKey: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await buyPackWithCredit(user.id, skuCode, clientKey);
  }, "Pack added — open it above!");
  revalidatePath("/", "layout");
  return res;
}

export async function claimWeeklyPackAction(): Promise<ActionResult<{ entitlementId: string }>> {
  const user = await requireUser();
  const res = await attempt(async () => ({ entitlementId: (await claimWeeklyPack(user.id)).id }), "Weekly pack claimed");
  revalidatePath("/", "layout");
  return res;
}
