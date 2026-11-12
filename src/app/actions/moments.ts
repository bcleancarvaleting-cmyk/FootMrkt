"use server";

import { requireUser } from "@/server/auth/session";
import { markMomentShown } from "@/server/moments";

export async function momentShownAction(id: string) {
  const user = await requireUser();
  if (/^[0-9a-f-]{36}$/.test(id)) await markMomentShown(user.id, id);
}
