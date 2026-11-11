"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/session";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { moveClub, movePlayer, startSeason } from "@/server/season";
import { type ActionResult, attempt } from "./result";

export async function startSeasonAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (f.get("confirm") !== "on") return { ok: false, error: "Tick the box to confirm." };
  const res = await attempt(() => startSeason(admin.id, String(f.get("season") ?? "").trim()));
  revalidatePath("/", "layout");
  if (!res.ok) return res;
  return { ok: true, data: undefined, message: `Season started. ${res.data.archived} archived${res.data.champion ? ` — champion ${res.data.champion}` : ""}.` };
}

export async function moveClubAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    await moveClub(admin.id, String(f.get("club")), String(f.get("league")));
  }, "Club moved");
  revalidatePath("/admin/season");
  return res;
}

export async function movePlayerAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const name = z.string().min(2).parse(String(f.get("player") ?? "").trim());
  const to = String(f.get("club") ?? "");
  const res = await attempt(async () => {
    const matches = await db.player.findMany({ where: { displayName: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (matches.length !== 1) throw new DomainError("AMBIGUOUS", matches.length ? `${matches.length} players are called ${name} — use Player database to pick the right one.` : `No player called ${name}.`);
    await movePlayer(admin.id, matches[0].id, to === "LEFT" ? null : to);
  }, to === "LEFT" ? "Player marked as left — their cards stay collectable" : "Transfer done — their cards follow them");
  revalidatePath("/admin/season");
  return res;
}
