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
 * Only TRADEABLE, unlocked cards count towards completion: starter cards are permanently locked
 * and listed/competition cards are busy.
 * Reward: £10 of MP credit per completed set (confirmed 9 Nov 2026); set definitions TO CONFIRM.
 */

export async function setProgress(userId: string) {
  const sets = await db.collectionSet.findMany({
    where: { active: true },
    include: { requirements: { include: { template: { include: { player: { include: { club: true } } } } } } },
    orderBy: { name: "asc" },
  });
  const templateIds = sets.flatMap((s) => s.requirements.map((r) => r.templateId));
  const owned = await db.cardInstance.findMany({
    where: { ownerId: userId, supplyState: "HELD", templateId: { in: templateIds } },
    select: { id: true, templateId: true, lock: true, tradeStatus: true },
  });
  return sets.map((set) => {
    const reqs = set.requirements.map((r) => {
      const mine = owned.filter((c) => c.templateId === r.templateId);
      const usable = mine.filter((c) => c.lock === "NONE" && c.tradeStatus === "TRADEABLE");
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
      const set = await tx.collectionSet.findUnique({ where: { id: setId }, include: { requirements: true } });
      if (!set || !set.active) throw new DomainError("NOT_FOUND", "Collection not found.");

      const chosen: string[] = [];
      for (const req of set.requirements) {
        const cards = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "CardInstance"
          WHERE "ownerId" = ${userId}::uuid AND "templateId" = ${req.templateId}::uuid AND "supplyState" = 'HELD'
            AND "lock" = 'NONE' AND "tradeStatus" = 'TRADEABLE'
          ORDER BY serial DESC LIMIT ${req.quantity} FOR UPDATE`;
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
      const moved = await tx.cardInstance.updateMany({
        where: { id: { in: chosen }, ownerId: userId, supplyState: "HELD", lock: "NONE" },
        data: { supplyState: "RECIRCULATING", ownerId: null, recycledCount: { increment: 1 } },
      });
      if (moved.count !== chosen.length) throw new Error("Cards changed during completion");
      await tx.favouriteCard.deleteMany({ where: { cardId: { in: chosen } } });

      // Product decision (9 Nov 2026): every completed set awards £10 of MP credit unless the
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
