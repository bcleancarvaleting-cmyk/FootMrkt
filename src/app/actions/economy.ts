"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { createChallenge, setChallengeActive } from "@/server/challenges";
import { createMatch, updateCompetitionRules } from "@/server/competitions";
import { db } from "@/server/db";
import { cancelDrop, scheduleDrop } from "@/server/drops";
import { DomainError } from "@/server/errors";
import { syncPackCatalogue } from "@/server/packs";
import { ensureClubBinders } from "@/server/collections";
import { cancelPlayerDrop, scheduleDrops } from "@/server/player-drops";
import { type SettingKey, type TextSettingKey, setSetting, setText } from "@/server/settings";
import { cancelAuction, clearHouseListings, createAuction, stockHouseListings, stockLaunchMix, stockPinnedListings } from "@/server/transfers";
import { addWelcomeGift, updateWelcomeGift } from "@/server/welcome";
import { backfillFoundingMembers } from "@/server/founders";
import { lockAllHeldCards } from "@/server/launch";
import { audit } from "@/server/audit";
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
    const [type, code] = str(f, "gift").split(":");
    const giftType = (type === "XP" || type === "MX" ? type : "PACK") as "PACK" | "XP" | "MX";
    const amount = giftType === "XP" ? Math.round(Number(str(f, "amount"))) : giftType === "MX" ? mp(f, "amount") : undefined;
    await scheduleDrop(admin.id, { title: str(f, "title"), giftType, skuCode: giftType === "PACK" ? code : undefined, amount, startsAt: new Date(str(f, "startsAt")), hours: Number(str(f, "hours") || 24) });
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
        includeUntradeable: f.get("excludeFree") === "on" ? false : undefined,
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
        clubs: list(f, "clubs"),
        maxPerClub: str(f, "maxPerClub") ? Number(str(f, "maxPerClub")) : undefined,
        maxSquadValueMp: str(f, "maxValue") ? Number(str(f, "maxValue")) : undefined,
        foundersOnly: f.get("foundersOnly") === "on" ? true : undefined,
        freeCardsOnly: f.get("freeCardsOnly") === "on" ? true : undefined,
      },
      prizes: str(f, "prizes"),
    });
  }, "Match rules saved");
  done();
  return res;
}

export async function createMatchAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const opt = (k: string) => str(f, k) || undefined;
  const res = await attempt(async () => {
    const c = await createMatch(admin.id, {
      gameweekId: str(f, "gameweekId"),
      name: opt("name"),
      fixtureIds: f.getAll("fixtureIds").map(String).filter(Boolean),
      kind: (opt("kind") ?? "CARDS") as "CARDS" | "DRAFT",
      league: opt("league"),
      tier: opt("tier") as "BRONZE" | "SILVER" | "GOLD" | undefined,
      freeCardsOnly: str(f, "cards") === "FREE",
      foundersOnly: str(f, "who") === "FOUNDERS",
      maxPerClub: opt("maxPerClub") ? Number(str(f, "maxPerClub")) : undefined,
      draftBudgetMx: opt("budget") ? Number(str(f, "budget")) : undefined,
      entryFeeMinor: mp(f, "fee"),
      winnerPack: opt("winnerPack") as "BRONZE" | "SILVER" | "GOLD" | undefined,
      top3Pack: opt("top3Pack") as "BRONZE" | "SILVER" | "GOLD" | undefined,
      everyonePack: opt("everyonePack") as "BRONZE" | "SILVER" | "GOLD" | undefined,
      prizes: str(f, "prizes"),
    });
    return c.name;
  });
  done();
  return res.ok ? { ok: true, data: undefined, message: `Created ${res.data}` } : res;
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

export async function addWelcomeGiftAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    await addWelcomeGift(admin.id, { skuCode: str(f, "skuCode"), afterDays: Number(str(f, "afterDays")) });
  }, "Welcome gift added");
  done();
  return res;
}

export async function updateWelcomeGiftAction(id: string, patch: { afterDays?: number; active?: boolean }): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    await updateWelcomeGift(admin.id, id, patch);
  }, "Saved");
  done();
  return res;
}

export async function stockHouseAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () =>
    stockHouseListings(admin.id, {
      tier: str(f, "tier") as "GOLD",
      count: Number(str(f, "count")),
      priceMinor: str(f, "price") ? mp(f, "price") : null,
      minPriceMinor: str(f, "min") ? mp(f, "min") : null,
      maxPriceMinor: str(f, "max") ? mp(f, "max") : null,
      markupPct: Number(str(f, "markup") || 0),
      days: Number(str(f, "days") || 7),
      leagues: list(f, "leagues"),
    }),
  );
  done();
  return res.ok ? { ok: true, data: undefined, message: `${res.data} card(s) listed on Transfers` } : res;
}

export async function clearHouseAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => clearHouseListings(admin.id));
  done();
  return res.ok ? { ok: true, data: undefined, message: `${res.data} MATCHX listing(s) withdrawn` } : res;
}

export async function pinnedListingsAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => stockPinnedListings(admin.id, str(f, "pinned"), Number(str(f, "days") || 7)));
  done();
  if (!res.ok) return res;
  const { listed, missed } = res.data;
  return listed.length
    ? { ok: true, data: undefined, message: `Listed ${listed.join(", ")}${missed.length ? ` · not listed: ${missed.join(", ")}` : ""}` }
    : { ok: false, error: `Nothing listed: ${missed.join(", ")}` };
}

export async function launchMixAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => stockLaunchMix(admin.id));
  done();
  return res.ok ? { ok: true, data: undefined, message: `${res.data.total} cards listed${res.data.missed.length ? ` · not listed: ${res.data.missed.join(", ")}` : ""}` } : res;
}

export async function backfillFoundersAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => backfillFoundingMembers(admin.id));
  done();
  return res.ok ? { ok: true, data: undefined, message: `${res.data} manager(s) made Founding Members` } : res;
}


export async function lockHeldCardsAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    const n = await lockAllHeldCards();
    await audit(db, { actorId: admin.id, action: "launch.lock_cards", entityType: "CardInstance", after: { locked: n } });
    return n;
  });
  done();
  return res.ok ? { ok: true, data: undefined, message: `${res.data} card(s) made untradeable` } : res;
}

export async function clubBindersAction(): Promise<ActionResult> {
  await requireAdmin();
  const res = await attempt(() => ensureClubBinders());
  done();
  return res.ok ? { ok: true, data: undefined, message: `${res.data} club binder(s) created` } : res;
}

export async function setSettingAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    await setSetting(admin.id, str(f, "key") as SettingKey, Number(str(f, "value")));
  }, "Saved");
  done();
  return res;
}

export async function scheduleDropsAction(items: Array<{ playerId: string; priceMinor: number; liveAt: string }>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => scheduleDrops(admin.id, items));
  done();
  if (!res.ok) return res;
  const { created, skipped } = res.data;
  return created.length
    ? { ok: true, data: undefined, message: `${created.length} drop(s) scheduled${skipped.length ? ` · skipped: ${skipped.join("; ")}` : ""}` }
    : { ok: false, error: `Nothing scheduled: ${skipped.join("; ")}` };
}

export async function cancelPlayerDropAction(listingId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(() => cancelPlayerDrop(admin.id, listingId), "Drop withdrawn");
  done();
  return res;
}

export async function setTextSettingAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    await setText(admin.id, str(f, "key") as TextSettingKey, String(f.get("value") ?? ""));
  }, "Saved");
  done();
  return res;
}

export async function appGiveawayAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    const { createAppGiveaway } = await import("@/server/app-messages");
    const r = await createAppGiveaway(admin.id, { title: str(f, "title"), message: str(f, "message"), packSku: str(f, "packSku") || undefined, mxMinor: mp(f, "mx"), openDays: Number(str(f, "openDays") || 0) });
    return r.sent;
  }, "Giveaway sent");
  done();
  return res.ok ? { ok: true, data: undefined, message: `Sent to ${res.data} app user${res.data === 1 ? "" : "s"}` } : res;
}

export async function closeAppGiveawayAction(id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => (await import("@/server/app-messages")).closeAppGiveaway(admin.id, id), "Giveaway closed");
  done();
  return res;
}

export async function startLaunchEmailsAction(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => (await import("@/server/waitlist")).startLaunchEmails(admin.id));
  done();
  return res.ok ? { ok: true, data: undefined, message: "Launch emails are going out — 200 now, the rest every 5 minutes." } : res;
}

export async function releaseMarketAction(launch: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  const res = await attempt(async () => {
    const { releaseMarketBatch } = await import("@/server/transfers");
    return releaseMarketBatch(admin.id, { perPlayer: 5, days: 14, resetValues: launch });
  });
  done();
  return res.ok ? { ok: true, data: undefined, message: `${res.data.listed.toLocaleString("en-GB")} copies listed · ${res.data.repriced.toLocaleString("en-GB")} re-priced · ${res.data.players.toLocaleString("en-GB")} players` } : res;
}
