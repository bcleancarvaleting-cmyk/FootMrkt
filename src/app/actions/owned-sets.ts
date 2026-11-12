"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { claimOwnedSet } from "@/server/owned-sets";
import { type ActionResult, attempt } from "./result";

export async function claimOwnedSetAction(code: string): Promise<ActionResult> {
  const user = await requireUser();
  const res = await attempt(async () => {
    await claimOwnedSet(user.id, code);
  }, "Claimed! The credit is in your wallet and the badge is on your club page.");
  revalidatePath("/", "layout");
  return res;
}
