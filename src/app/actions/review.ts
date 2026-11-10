"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { resolveFlag } from "@/server/market-safety";
import { type ActionResult, attempt } from "./result";

export async function resolveFlagAction(flagId: string, outcome: "CLEARED" | "ACTIONED", suspend: Array<"seller" | "buyer">): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => resolveFlag(admin.id, flagId, outcome, null, suspend), outcome === "CLEARED" ? "Cleared" : suspend.length ? "Account(s) suspended" : "Marked as dealt with");
  revalidatePath("/admin/trade-review");
  return res;
}
