"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/session";
import { DomainError } from "@/server/errors";
import { createLiveGameweek, linkClubs, linkPlayers, setPlayerProviderId, syncLiveGameweek } from "@/server/live-data";
import { type ActionResult, attempt } from "./result";

/** Provider/network failures become a readable message instead of an error page. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError("PROVIDER", e instanceof Error ? e.message : "The data provider didn't respond.");
  }
}

export async function linkClubsAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const season = z.string().regex(/^\d{4}-\d{2}$/, "Season looks like 2026-27").parse(f.get("season"));
  const res = await attempt(() => guard(() => linkClubs(season, admin.id)));
  revalidatePath("/admin/live-data");
  if (!res.ok) return res;
  const linked = res.data.reduce((n, l) => n + l.linked, 0);
  const missing = res.data.flatMap((l) => l.unmatched);
  return { ok: true, data: undefined, message: `${linked} clubs linked${missing.length ? ` · not found: ${missing.join(", ")}` : ""}` };
}

export async function linkPlayersAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  void f;
  const res = await attempt(() => guard(() => linkPlayers(admin.id)));
  if (res.ok) {
    revalidatePath("/admin/live-data");
    return { ok: true, data: undefined, message: `${res.data.linked} players linked · ${res.data.unmatched.reduce((n, u) => n + u.provider.length, 0)} provider players not matched` };
  }
  return res;
}

export async function linkPlayerAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const playerId = z.string().uuid().parse(f.get("playerId"));
  const providerId = z.string().regex(/^\d+$/, "Provider ids are numbers").parse(f.get("providerId"));
  const res = await attempt(() => setPlayerProviderId(playerId, providerId, admin.id), "Player linked");
  revalidatePath("/admin/live-data");
  return res;
}

export async function createLiveGameweekAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const s = z
    .object({
      season: z.string().regex(/^\d{4}-\d{2}$/, "Season looks like 2026-27"),
      number: z.coerce.number().int().min(1).max(60),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .parse(Object.fromEntries(f));
  const res = await attempt(async () => {
    await guard(() => createLiveGameweek({ ...s, opensAt: new Date(), actorId: admin.id }));
  }, `Gameweek ${s.number} created from real fixtures`);
  revalidatePath("/", "layout");
  return res;
}

export async function syncLiveAction(gameweekId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => guard(() => syncLiveGameweek(gameweekId, admin.id)));
  revalidatePath("/", "layout");
  if (res.ok) return { ok: true, data: undefined, message: `${res.data.fixtures} fixture(s) polled · ${res.data.applied} updates · ${res.data.unknown} not matched` };
  return res;
}
