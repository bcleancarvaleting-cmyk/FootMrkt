"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { removeMessage } from "@/server/chat";
import { inviteModerator, keepMessage, respondToInvite, revokeModerator } from "@/server/moderation";
import { type ActionResult, attempt } from "./result";

export async function inviteModeratorAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    const r = await inviteModerator(user.id, String(form.get("who") ?? ""));
    return `Invitation sent to ${r.user.displayName}`;
  });
  revalidatePath("/admin");
  return res.ok ? { ok: true, data: undefined, message: res.data } : res;
}

export async function revokeModeratorAction(userId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => revokeModerator(user.id, userId), "Moderator access removed");
  revalidatePath("/admin");
  return res;
}

export async function respondInviteAction(inviteId: string, accept: boolean): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => respondToInvite(user.id, inviteId, accept), accept ? "You're now a moderator" : "Invitation declined");
  revalidatePath("/", "layout");
  return res;
}

export async function keepMessageAction(messageId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => keepMessage(user, messageId), "Kept — reports cleared");
  revalidatePath("/moderation");
  return res;
}

export async function removeReportedAction(messageId: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(() => removeMessage(user, messageId), "Message removed");
  revalidatePath("/moderation");
  return res;
}
