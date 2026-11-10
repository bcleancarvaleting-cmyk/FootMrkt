"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { applyPastedValues, previewPastedValues } from "@/server/market-values";
import { estimateAllValues } from "@/server/value-estimates";
import { type ActionResult, attempt } from "./result";

export async function previewValuesAction(text: string) {
  await requireAdmin();
  return attempt(() => previewPastedValues(text));
}

export async function applyValuesAction(text: string, source: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    const r = await applyPastedValues(text, source, admin.id);
    return `${r.updated} values saved · ${r.retiered} players changed tier`;
  });
  revalidatePath("/", "layout");
  return res.ok ? { ok: true, data: undefined, message: res.data } : res;
}

export async function estimateValuesAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    const r = await estimateAllValues(admin.id);
    return `${r.players} estimates refreshed (${r.named} named) · ${r.retiered} changed tier · ${r.keptOtherSources} entered values kept`;
  });
  revalidatePath("/", "layout");
  return res.ok ? { ok: true, data: undefined, message: res.data } : res;
}
