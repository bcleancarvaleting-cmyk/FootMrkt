import type { Prisma } from "@/generated/prisma/client";
import { db, withTx } from "./db";
import { DomainError, isUniqueViolation } from "./errors";
import { grantPack } from "./packs";
import { SET_REWARD_MP_MINOR, credit } from "./wallet";

/**
 * Binder collections (spec §8.1). Completing a set is user-confirmed. On completion the set's
 * card instances leave the user's Binder atomically and return to the active pack pool as
 * RECIRCULATING (they are only ever re-issued through normal pack openings). Instance ids and
 * the full ownership history are preserved.
 *
 * Only unlocked pool cards (STANDARD edition) count towards completion — free/starter copies are a
 * separate edition, and listed/competition cards are busy. Launch-period cards that are untradeable
 * still count; once handed in they go back into packs as tradeable cards.
 * Reward: £10 of MX credit per completed set (confirmed 9 Nov 2026); set definitions TO CONFIRM.
 */

export async function setProgress(userId: string) {
  const sets = await db.collectionSet.findMany({
    where: { active: true },
    include: { requirements: { include: { template: { include: { player: { include: { club: true } } } } } } },
    orderBy: { name: "asc" },
  });
  // A requirement is a player in a tier: any copy counts — bought, packed or free.
  const playerIds = [...new Set(sets.flatMap((s) => s.requirements.map((r) => r.template.playerId)))];
  const owned = await db.cardInstance.findMany({
    where: { ownerId: userId, supplyState: "HELD", loanGameweeks: null, template: { playerId: { in: playerIds } } },
    select: { id: true, lock: true, template: { select: { playerId: true, category: true } } },
  });
  return sets.map((set) => {
    const reqs = set.requirements.map((r) => {
      const mine = owned.filter((c) => c.template.playerId === r.template.playerId && c.template.category === r.template.category);
      const usable = mine.filter((c) => c.lock === "NONE");
      return { requirement: r, owned: mine.length, usable: usable.length, satisfied: usable.length >= r.quantity };
    });
    return { set, requirements: reqs, complete: reqs.every((r) => r.satisfied) };
  });
}

export async function completeSet(userId: string, setId: string, idempotencyKey: string) {
  try {
    return await withTx(async (tx) => {
      const prior = await tx.collectionCompletion.findUnique({ where: { idempotencyKey } });
      if (prior) return prior;
      const set = await tx.collectionSet.findUnique({ where: { id: setId }, include: { requirements: { include: { template: true } } } });
      if (!set || !set.active) throw new DomainError("NOT_FOUND", "Collection not found.");

      const chosen: string[] = [];
      for (const req of set.requirements) {
        // Free (STARTER edition) copies are used first, so bought/packed cards are kept where possible.
        const cards = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT ci.id FROM "CardInstance" ci JOIN "CardTemplate" t ON t.id = ci."templateId"
          WHERE ci."ownerId" = ${userId}::uuid AND t."playerId" = ${req.template.playerId}::uuid
            AND t.category = ${req.template.category}::"CardCategory" AND ci."supplyState" = 'HELD' AND ci."lock" = 'NONE'
            AND t.edition <> 'LOAN' AND ci."loanGameweeks" IS NULL
            AND NOT (ci.id = ANY(${chosen}::uuid[]))
          ORDER BY (t.edition = 'STARTER') DESC, ci.serial DESC LIMIT ${req.quantity} FOR UPDATE OF ci`;
        if (cards.length < req.quantity) throw new DomainError("INCOMPLETE", "You don't have every card needed for this collection.");
        chosen.push(...cards.map((c) => c.id));
      }

      const completion = await tx.collectionCompletion.create({
        data: { setId, userId, cardIds: chosen, idempotencyKey },
      });
      const now = new Date();
      const closed = await tx.cardOwnership.updateMany({
        where: { cardId: { in: chosen }, userId, releasedAt: null },
        data: { releasedAt: now, releasedVia: "COLLECTION_COMPLETION", releasedRef: completion.id },
      });
      if (closed.count !== chosen.length) throw new Error("Ownership records out of sync");
      // Pool cards go back into packs (tradeable for the next owner); free minted copies are retired.
      const recycled = await tx.cardInstance.updateMany({
        where: { id: { in: chosen }, ownerId: userId, supplyState: "HELD", lock: "NONE", packable: true, template: { edition: "STANDARD" } },
        data: { supplyState: "RECIRCULATING", ownerId: null, tradeStatus: "TRADEABLE", recycledCount: { increment: 1 } },
      });
      const retired = await tx.cardInstance.updateMany({
        where: { id: { in: chosen }, ownerId: userId, supplyState: "HELD", lock: "NONE", OR: [{ packable: false }, { template: { edition: { not: "STANDARD" } } }] },
        data: { supplyState: "RETIRED", ownerId: null },
      });
      if (recycled.count + retired.count !== chosen.length) throw new Error("Cards changed during completion");
      await tx.favouriteCard.deleteMany({ where: { cardId: { in: chosen } } });

      // Product decision (9 Nov 2026): every completed set awards £10 of MX credit unless the
      // set overrides it with { mpCreditMinor }.
      const reward = (set.reward ?? {}) as { packSkuCode?: string; mpCreditMinor?: number };
      const mp = reward.mpCreditMinor ?? SET_REWARD_MP_MINOR;
      if (mp > 0) {
        await credit(tx, { userId, amountMinor: mp, kind: "SET_REWARD", refId: `set:${completion.id}`, note: set.name });
      }
      if (reward.packSkuCode) {
        await grantPack(tx, { userId, skuCode: reward.packSkuCode, source: "REWARD", sourceRef: `set:${completion.id}` });
      }
      return completion;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return db.collectionCompletion.findUniqueOrThrow({ where: { idempotencyKey } });
    throw e;
  }
}

export type SetReward = Prisma.JsonValue;

/**
 * Club binders (product decision 10 Nov 2026): a 5-player set for every club — its best
 * goalkeeper, defender, midfielder and attacker plus the next most valuable player, in their
 * current tiers. Completing one pays SET_REWARD_MP_MINOR earned credit. Creates only missing binders.
 */
export async function ensureClubBinders() {
  const sport = await db.sport.findUniqueOrThrow({ where: { code: "football" } });
  const clubs = await db.club.findMany({ orderBy: { name: "asc" } });
  let created = 0;
  for (const club of clubs) {
    const code = `binder-${club.code.toLowerCase()}`;
    if (await db.collectionSet.findUnique({ where: { code } })) continue;
    const tpls = await db.cardTemplate.findMany({
      where: { active: true, edition: "STANDARD", player: { clubId: club.id, active: true } },
      include: { player: true },
      orderBy: [{ player: { marketValueGbp: { sort: "desc", nulls: "last" } } }, { player: { squadNumber: { sort: "asc", nulls: "last" } } }],
    });
    const picked: typeof tpls = [];
    for (const pos of ["GK", "DEF", "MID", "ATT"] as const) {
      const t = tpls.find((x) => x.player.position === pos);
      if (t) picked.push(t);
    }
    const extra = tpls.find((x) => !picked.includes(x));
    if (extra) picked.push(extra);
    if (picked.length < 5) continue;
    await db.collectionSet.create({
      data: {
        sportId: sport.id,
        code,
        name: `${club.name} Binder`,
        description: `Collect five ${club.name} players — any copies count, free cards included.`,
        reward: { mpCreditMinor: SET_REWARD_MP_MINOR },
        requirements: { create: picked.map((t) => ({ templateId: t.id })) },
      },
    });
    created++;
  }
  return created;
}
