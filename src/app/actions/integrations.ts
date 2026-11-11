"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { testSportmonksToken } from "@/providers/football/sportmonks";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { loadIntegrationState, setDataProvider } from "@/server/integrations";
import { runRebuild, startRebuild } from "@/server/rebuild";
import { deleteSecret, saveSecret } from "@/server/secrets";
import { runSportmonksCheck } from "@/server/sportmonks-check";
import { type ActionResult, attempt } from "./result";

const refresh = () => revalidatePath("/admin/integrations");

export async function saveSportmonksTokenAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const token = String(f.get("token") ?? "").trim();
  if (token.length < 20 || /\s/.test(token)) return { ok: false, error: "That doesn't look like a Sportmonks API token — copy it again from my.sportmonks.com → API → Tokens." };
  const test = await testSportmonksToken(token);
  if (!test.ok) return { ok: false, error: `Sportmonks didn't accept it: ${test.message}. Check you copied the whole token (or create a new one).` };
  await saveSecret("sportmonks", token, admin.id);
  await loadIntegrationState(true);
  refresh();
  return { ok: true, data: undefined, message: `Saved — Sportmonks recognised it. Leagues on your plan: ${test.leagues.join(", ") || "none listed"}.` };
}

export async function removeSportmonksTokenAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    await deleteSecret("sportmonks", admin.id);
    await loadIntegrationState(true);
  }, "Token removed");
  refresh();
  return res;
}

export async function runSportmonksCheckAction(): Promise<ActionResult> {
  await requireAdmin();
  const result = await runSportmonksCheck();
  await db.appSetting.upsert({
    where: { key: "sportmonks.lastCheck" },
    create: { key: "sportmonks.lastCheck", value: { at: new Date().toISOString(), ...result } },
    update: { value: { at: new Date().toISOString(), ...result } },
  });
  refresh();
  return result.passed ? { ok: true, data: undefined, message: "All checks passed — see the results below." } : { ok: false, error: "Some checks didn't pass — see the results below." };
}

export async function setSportmonksOnAction(on: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => setDataProvider(on ? "sportmonks" : "", admin.id), on ? "Data switched to Sportmonks" : "Switched back to the development data");
  revalidatePath("/", "layout");
  return res;
}

export async function rebuildFromSportmonksAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => startRebuild(admin.id), "Rebuild started — it takes several minutes. Refresh this page to follow it.");
  if (res.ok) after(() => runRebuild(admin.id));
  refresh();
  return res;
}
