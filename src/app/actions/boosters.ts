"use server";

import { revalidatePath } from "next/cache";
import type { BoosterKind } from "@/config/boosters";
import { requireUser } from "@/server/auth/session";
import { openBoosterPack } from "@/server/boosters";
import { type ActionResult, attempt } from "./result";

export async function openBoosterPackAction(packId: string): Promise<ActionResult<BoosterKind>> {
  const user = await requireUser();
  const res = await attempt(() => openBoosterPack(user.id, packId));
  revalidatePath("/packs");
  return res;
}
