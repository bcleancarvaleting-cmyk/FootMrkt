"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { createChallenge, setChallengeActive } from "@/server/challenges";
import { updateCompetitionRules } from "@/server/competitions";
import { db } from "@/server/db";
import { cancelDrop, scheduleDrop } from "@/server/drops";
import { DomainError } from "@/server/errors";
import { syncPackCatalogue } from "@/server/packs";
import { cancelAuction, createAuction } from "@/server/transfers";
import { processWithdrawal } from "@/server/wallet";
import { type ActionResult, attempt } from "./result";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const mp = (f: FormData, k: string) => Math.round(Number(str(f, k) || 0) * 100);
const list = (f: FormData, k: string) => {
  const v = str(f, k);
  return v ? v.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) : undefined;
};
const done = () => revalidatePath("/", "layout");

export async function scheduleDropAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    await scheduleDrop(admin.id, { title: str(f, "title"), startsAt: new Date(str(f, "startsAt")), hours: Number(str(f, "hours") || 24) });
  }, "Free pack drop scheduled");
  done();
  return res;
}

export async function cancelDropAction(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => cancelDrop(admin.id, id), "Drop cancelled");
  done();
  return res;
}

export async function createAuctionAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    const q = str(f, "player");
    const player = await db.player.findFirst({ where: { OR: [{ displayName: { equals: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] }, orderBy: { marketValueGbp: { sort: "desc", nulls: "last" } } });
    if (!player) throw new DomainError("NOT_FOUND", `No player matches “${q}”.`);
    const reserve = mp(f, "reserve");
    await createAuction(admin.id, {
      playerId: player.id,
      category: str(f, "category") as "GOLD",
      startPriceMinor: mp(f, "start"),
      minIncrementMinor: mp(f, "increment") || 10,
      reserveMinor: reserve > 0 ? reserve : undefined,
      startsAt: str(f, "startsAt") ? new Date(str(f, "startsAt")) : new Date(),
      hours: Number(str(f, "hours") || 24),
    });
    return player.displayName;
  });
  done();
  return res.ok ? { ok: true, data: undefined, message: `Auction created for ${res.data}` } : res;
}

export async function cancelAuctionAction(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => cancelAuction(admin.id, id), "Auction cancelled — bids returned");
  done();
  return res;
}

export async function createChallengeAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    await createChallenge(admin.id, {
      code: str(f, "code"),
      name: str(f, "name"),
      description: str(f, "description"),
      criteria: {
        count: Number(str(f, "count")),
        tiers: list(f, "tiers") as never,
        positions: list(f, "positions") as never,
        leagues: list(f, "leagues"),
        maxPerClub: str(f, "maxPerClub") ? Number(str(f, "maxPerClub")) : undefined,
        includeUntradeable: f.get("includeUntradeable") === "on" ? true : undefined,
      },
      rewardMinor: mp(f, "reward"),
      rewardPackSku: str(f, "pack") || undefined,
      maxPerUser: str(f, "maxPerUser") ? Number(str(f, "maxPerUser")) : undefined,
      endsAt: str(f, "endsAt") ? new Date(str(f, "endsAt")) : undefined,
    });
  }, "Challenge created");
  done();
  return res;
}

export async function toggleChallengeAction(id: string, active: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    await setChallengeActive(admin.id, id, active);
  }, active ? "Challenge live" : "Challenge paused");
  done();
  return res;
}

export async function competitionRulesAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    await updateCompetitionRules(admin.id, str(f, "competitionId"), {
      entryFeeMinor: mp(f, "fee"),
      requirements: {
        tiers: list(f, "tiers"),
        leagues: list(f, "leagues"),
        maxPerClub: str(f, "maxPerClub") ? Number(str(f, "maxPerClub")) : undefined,
        maxSquadValueMp: str(f, "maxValue") ? Number(str(f, "maxValue")) : undefined,
      },
    });
  }, "Match rules saved");
  done();
  return res;
}

export async function processWithdrawalAction(id: string, decision: "PAID" | "REJECTED"): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => processWithdrawal(admin.id, id, decision, decision === "PAID" ? `manual-${Date.now()}` : undefined), decision === "PAID" ? "Marked as paid" : "Rejected — funds returned");
  done();
  return res;
}

export async function syncPacksAction(): Promise<ActionResult> {
  await requireAdmin();
  const res = await attempt(async () => `${await syncPackCatalogue()} new pack version(s) published`);
  done();
  return res.ok ? { ok: true, data: undefined, message: res.data } : res;
}
