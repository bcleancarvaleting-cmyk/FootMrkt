"use server";

import { submitDraftEntry } from "@/server/draft";
import { toggleShowcase } from "@/server/club-profile";
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
import { buyPackWithCredit, buyPackWithXp } from "@/server/wallet";
import { claimWeeklyPack } from "@/server/weekly";
import { rateLimit } from "@/lib/rate-limit";
import { emailUser } from "@/server/email/send";
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
  if (res.ok) await afterEntryEmails(user.id, competitionId);
  revalidatePath(`/competitions/${competitionId}`);
  revalidatePath("/matches");
  return res;
}

export async function submitDraftEntryAction(competitionId: string, submission: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await submitDraftEntry(user.id, competitionId, submission);
  }, "Draft squad saved");
  if (res.ok) await afterEntryEmails(user.id, competitionId);
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

export async function toggleShowcaseAction(cardId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    const pinned = await toggleShowcase(user.id, cardId);
    return pinned;
  });
  revalidatePath(`/cards/${cardId}`);
  revalidatePath(`/clubs/${encodeURIComponent(user.displayName)}`);
  if (!res.ok) return res;
  return { ok: true, data: undefined, message: res.data ? "Pinned to your club page" : "Unpinned" };
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

export async function buyPackWithXpAction(skuCode: string, clientKey: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await buyPackWithXp(user.id, skuCode, clientKey);
  }, "Pack added — open it above!");
  revalidatePath("/", "layout");
  return res;
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

/** Team-sheet confirmation, and the referrer's reward email the first time a referred manager plays. */
async function afterEntryEmails(userId: string, competitionId: string) {
  const entry = await db.competitionEntry.findUnique({
    where: { competitionId_userId: { competitionId, userId } },
    include: { competition: true, selections: { where: { isCaptain: true }, include: { player: { select: { displayName: true } } } } },
  });
  if (!entry) return;
  const edit = entry.updatedAt.getTime() - entry.createdAt.getTime() > 2000;
  await emailUser(userId, "teamSheet", { match: entry.competition.name, captain: entry.selections[0]?.player.displayName ?? null, deadline: entry.competition.locksAt, edit }, `teamsheet:${entry.id}:${Math.floor(Date.now() / 600_000)}`);
  const reward = await db.packEntitlement.findUnique({ where: { sourceRef: `referral:${userId}` }, include: { packSku: true } });
  if (reward) {
    const me = await db.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    await emailUser(reward.userId, "referralReward", { friend: me?.displayName ?? "Your friend", pack: reward.packSku.name }, `referral:${userId}`);
  }
}

export async function packOrderStatusAction(orderId: string) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(orderId)) return null;
  const { confirmOrderWithProvider, packOrderStatus } = await import("@/server/market");
  await confirmOrderWithProvider(user.id, orderId).catch((e) => console.error("confirm order", e));
  return packOrderStatus(user.id, orderId);
}
