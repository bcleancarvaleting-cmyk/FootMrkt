"use server";

import type { BoosterKind } from "@/config/boosters";
import { requireUser } from "@/server/auth/session";
import { openBoosterPack } from "@/server/boosters";
import { type ActionResult, attempt } from "./result";

export async function openBoosterPackAction(packId: string): Promise<ActionResult<BoosterKind>> {
  const user = await requireUser();
  // No page refresh here: the reel plays on the client, and the Packs page is rendered fresh on the next visit.
  return attempt(() => openBoosterPack(user.id, packId));
}
