import type { CardCategory } from "@/generated/prisma/client";
import { GOLD_PICK_CODE } from "@/config/packs";
import { ensureTemplate, mintInstances } from "./cards";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { CARD_INCLUDE, enrichCards } from "./views";

/**
 * Player picks ("Choice of Gold"): the manager is offered three players of a tier and keeps one,
 * minted as a free, untradeable card. The three options are fixed for each pack (derived from the
 * entitlement id), so reloading the page never re-rolls them.
 */
export const PICKS: Record<string, { category: CardCategory; options: number }> = {
  [GOLD_PICK_CODE]: { category: "GOLD", options: 3 },
};

export const isPick = (skuCode: string) => skuCode in PICKS;

function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h >>>= 0) % 1_000_000) / 1_000_000;
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
    where: { active: true, templates: { some: { category: pick.category, edition: "STANDARD", active: true } } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (players.length < pick.options) throw new DomainError("NO_PLAYERS", "Not enough players to pick from right now.");
  const rnd = seeded(ent.id);
  const chosen = new Set<string>();
  while (chosen.size < pick.options) chosen.add(players[Math.floor(rnd() * players.length)].id);
  const ids = [...chosen];
  // Show each option as a card face: use any instance of the player's tier for the view.
  const samples = await Promise.all(
    ids.map((playerId) => db.cardInstance.findFirst({ where: { template: { playerId, category: pick.category } }, include: CARD_INCLUDE })),
  );
  const views = await enrichCards(samples.filter((x): x is NonNullable<typeof x> => !!x));
  return { entitlement: ent, category: pick.category, playerIds: ids, cards: views, opened: ent.status !== "UNOPENED" };
}

/** Keep one of the offered players. Idempotent: a used pick can't be used again. */
export async function choosePick(userId: string, entitlementId: string, playerId: string) {
  const { playerIds, category, entitlement } = await pickOptions(userId, entitlementId);
  if (!playerIds.includes(playerId)) throw new DomainError("NOT_OFFERED", "That player isn't one of your choices.");
  return withTx(async (tx) => {
    const used = await tx.packEntitlement.updateMany({ where: { id: entitlementId, userId, status: "UNOPENED" }, data: { status: "OPENED", openedAt: new Date() } });
    if (!used.count) throw new DomainError("ALREADY_PICKED", "You've already made this pick.");
    const tpl = await ensureTemplate(tx, playerId, category, "STARTER");
    const [cardId] = await mintInstances(tx, { templateId: tpl.id, count: 1, state: "HELD", ownerId: userId, tradeStatus: "NON_TRADEABLE" });
    if (!cardId) throw new DomainError("NO_STOCK", "That player can't be issued right now — pick another.");
    const opening = await tx.packOpening.create({
      data: {
        userId,
        packSkuId: entitlement.packSkuId,
        entitlementId,
        pricePaidMinor: 0,
        configSnapshot: { code: entitlement.packSku.code, version: entitlement.packSku.version, pick: { category, offered: playerIds } },
        rngAudit: { source: "seeded:entitlement", offered: playerIds, chosen: playerId },
      },
    });
    await tx.cardOwnership.create({ data: { cardId, userId, acquiredVia: "WEEKLY_PACK", acquiredRef: opening.id } });
    await tx.packOpeningCard.create({ data: { packOpeningId: opening.id, cardId, slotIndex: 0, category } });
    return { openingId: opening.id, cardId };
  });
}
