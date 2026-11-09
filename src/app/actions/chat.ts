"use server";

import { requireUser } from "@/server/auth/session";
import { postMessage, removeMessage, reportMessage } from "@/server/chat";
import { type ActionResult, attempt } from "./result";

export async function sendChatAction(room: string, body: string): Promise<ActionResult> {
  const user = await requireUser();
  return attempt(async () => {
    await postMessage(user.id, room, body);
  });
}

export async function reportChatAction(messageId: string): Promise<ActionResult> {
  const user = await requireUser();
  return attempt(() => reportMessage(user.id, messageId), "Reported — thanks. A moderator will review it.");
}

export async function removeChatAction(messageId: string): Promise<ActionResult> {
  const user = await requireUser();
  return attempt(() => removeMessage(user, messageId), "Message removed");
}
