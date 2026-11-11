import { createHmac } from "node:crypto";
import type { CardCategory } from "@/generated/prisma/client";
import { BRONZE_PICK_CODE, GOLD_PICK_CODE, LEAGUE_PICK_CODES, LOAN_PICK_CODE, SILVER_PICK_CODE } from "@/config/packs";
import { LOAN_GAMEWEEKS } from "./loans";
import { ensureTemplate, mintInstances } from "./cards";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { CARD_INCLUDE, type CardWithTemplate, enrichCards } from "./views";

/**
 * Player picks ("Choice of Gold"): the manager is offered a random shortlist of players of a tier
 * and keeps some, minted as free, untradeable cards. The options are random but fixed for each
 * pack (see pickStream), so reloading the page never re-rolls them.
 *
 * Starter Loans offer six Gold players from the top flight (the Premier League today; any other
 * top-flight league added later joins automatically) and the manager keeps two, on loan.
 */
export interface PickConfig {
  category: CardCategory;
  /** How many players are offered. */
  options: number;
  /** How many the manager keeps. */
  keep: number;
  /** Only offer players from top-flight leagues. */
  topFlight?: boolean;
  /** Loan length in gameweeks; omitted for permanent cards. */
  loanGameweeks?: number;
  /** Only players from leagues of this tier (1 = Premier League … 4 = League Two). */
  leagueTier?: number;
  /** Only the league's N most valuable players of the tier (by market value). */
  mostValuable?: number;
}

export const PICKS: Record<string, PickConfig> = {
  [GOLD_PICK_CODE]: { category: "GOLD", options: 3, keep: 1 },
  [SILVER_PICK_CODE]: { category: "SILVER", options: 3, keep: 1 },
  [BRONZE_PICK_CODE]: { category: "BRONZE", options: 3, keep: 1 },
  [LOAN_PICK_CODE]: { category: "GOLD", options: 6, keep: 2, topFlight: true, loanGameweeks: LOAN_GAMEWEEKS },
  // Sign-up league picks (11 Nov 2026): 1 of 4 from the league's 40 most valuable players.
  // League One and League Two only have Bronze players; the Championship pick is Silver.
  [LEAGUE_PICK_CODES.LG2]: { category: "BRONZE", options: 4, keep: 1, leagueTier: 4, mostValuable: 40 },
  [LEAGUE_PICK_CODES.LG1]: { category: "BRONZE", options: 4, keep: 1, leagueTier: 3, mostValuable: 40 },
  [LEAGUE_PICK_CODES.CHA]: { category: "SILVER", options: 4, keep: 1, leagueTier: 2, mostValuable: 40 },
};

export const isPick = (skuCode: string) => skuCode in PICKS;

/**
 * Unpredictable but fixed per pack: HMAC-SHA256 of the pack id under a server secret, so nobody
 * (managers or staff) can work out or re-roll the three options. Uniform via rejection sampling.
 */
function pickStream(seed: string) {
  const secret = process.env.PICK_SECRET ?? process.env.SESSION_SECRET ?? process.env.DATABASE_URL ?? "matchx";
  let counter = 0;
  return (max: number) => {
    const limit = Math.floor(0x1_0000_0000 / max) * max;
    for (;;) {
      const n = createHmac("sha256", secret).update(`${seed}:${counter++}`).digest().readUInt32BE(0);
      if (n < limit) return n % max;
    }
  };
}

async function loadEntitlement(userId: string, entitlementId: string) {
  const ent = await db.packEntitlement.findUnique({ where: { id: entitlementId }, include: { packSku: true } });
  if (!ent || ent.userId !== userId) throw new DomainError("NOT_FOUND", "Pack not found.");
  const pick = PICKS[ent.packSku.code];
  if (!pick) throw new DomainError("NOT_A_PICK", "This pack isn't a player pick.");
  return { ent, pick };
}

/** The players on offer for this pick (same every time for the same pack). */
export async function pickOptions(userId: string, entitlementId: string) {
  const { ent, pick } = await loadEntitlement(userId, entitlementId);
  const players = await db.player.findMany({
    where: {
      active: true,
      templates: { some: { category: pick.category, edition: "STANDARD", active: true } },
      club: pick.topFlight ? { league: { isTopFlight: true } } : pick.leagueTier ? { league: { tier: pick.leagueTier, country: "ENG" } } : undefined,
    },
    select: { id: true },
    // Most valuable first when the pick is limited to the top N (ties by id, so the list is stable).
    orderBy: pick.mostValuable ? [{ marketValueGbp: { sort: "desc", nulls: "last" } }, { id: "asc" }] : { id: "asc" },
    take: pick.mostValuable,
  });
  if (players.length < pick.options) throw new DomainError("NO_PLAYERS", "Not enough players to pick from right now.");
  const next = pickStream(ent.id);
  const chosen = new Set<string>();
  while (chosen.size < pick.options) chosen.add(players[next(players.length)].id);
  const ids = [...chosen];
  // Show each option as a card face, drawn from the player's tier template (no copy needs to exist yet).
  const templates = await db.cardTemplate.findMany({
    where: { playerId: { in: ids }, category: pick.category, edition: "STANDARD", active: true },
    include: CARD_INCLUDE.template.include,
  });
  const samples: CardWithTemplate[] = ids.flatMap((playerId) => {
    const template = templates.find((t) => t.playerId === playerId);
    if (!template) return [];
    const face: CardWithTemplate = {
      id: `option-${playerId}`,
      templateId: template.id,
      template,
      serial: 0,
      supplyState: "AVAILABLE",
      tradeStatus: "NON_TRADEABLE",
      ownerId: null,
      lock: "NONE",
      lockRef: null,
      releaseId: null,
      recycledCount: 0,
      packable: false,
      loanGameweeks: null,
      finish: null,
      mintedAt: new Date(0),
      updatedAt: new Date(0),
    };
    return [face];
  });
  const views = (await enrichCards(samples)).map((v) =>
    pick.loanGameweeks ? { ...v, edition: "LOAN" as const, loan: { left: pick.loanGameweeks, total: pick.loanGameweeks, ended: false }, valueMp: null, trendPct: null, lock: "NONE" as const } : v,
  );
  return { entitlement: ent, category: pick.category, pick, playerIds: ids, cards: views, opened: ent.status !== "UNOPENED" };
}

/** Keep the offered player(s). Idempotent: a used pick can't be used again. */
export async function choosePick(userId: string, entitlementId: string, chosen: string | string[]) {
  const playerIdsChosen = [...new Set(Array.isArray(chosen) ? chosen : [chosen])];
  const { playerIds, category, entitlement, pick } = await pickOptions(userId, entitlementId);
  if (playerIdsChosen.length !== pick.keep) throw new DomainError("PICK_COUNT", `Choose ${pick.keep} player${pick.keep > 1 ? "s" : ""}.`);
  if (playerIdsChosen.some((id) => !playerIds.includes(id))) throw new DomainError("NOT_OFFERED", "That player isn't one of your choices.");
  const edition = pick.loanGameweeks ? "LOAN" : "STARTER";
  return withTx(async (tx) => {
    const used = await tx.packEntitlement.updateMany({ where: { id: entitlementId, userId, status: "UNOPENED" }, data: { status: "OPENED", openedAt: new Date() } });
    if (!used.count) throw new DomainError("ALREADY_PICKED", "You've already made this pick.");
    const opening = await tx.packOpening.create({
      data: {
        userId,
        packSkuId: entitlement.packSkuId,
        entitlementId,
        pricePaidMinor: 0,
        configSnapshot: { code: entitlement.packSku.code, version: entitlement.packSku.version, pick: { category, offered: playerIds, keep: pick.keep, loanGameweeks: pick.loanGameweeks ?? null } },
        rngAudit: { source: "seeded:entitlement", offered: playerIds, chosen: playerIdsChosen },
      },
    });
    const cardIds: string[] = [];
    for (const [slotIndex, playerId] of playerIdsChosen.entries()) {
      const tpl = await ensureTemplate(tx, playerId, category, edition);
      const [cardId] = await mintInstances(tx, { templateId: tpl.id, count: 1, state: "HELD", ownerId: userId, tradeStatus: "NON_TRADEABLE" });
      if (!cardId) throw new DomainError("NO_STOCK", "That player can't be issued right now — pick another.");
      if (pick.loanGameweeks) await tx.cardInstance.update({ where: { id: cardId }, data: { loanGameweeks: pick.loanGameweeks } });
      await tx.cardOwnership.create({ data: { cardId, userId, acquiredVia: "WEEKLY_PACK", acquiredRef: opening.id } });
      await tx.packOpeningCard.create({ data: { packOpeningId: opening.id, cardId, slotIndex, category } });
      cardIds.push(cardId);
    }
    return { openingId: opening.id, cardId: cardIds[0], cardIds };
  });
}
