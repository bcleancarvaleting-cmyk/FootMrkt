import type { Prisma } from "@/generated/prisma/client";
import { type ChallengeCriteria, DEFAULT_CHALLENGES } from "@/config/challenges";
import { z } from "zod";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { DomainError, isUniqueViolation } from "./errors";
import { grantPack } from "./packs";
import { CARD_INCLUDE, enrichCards } from "./views";
import { credit } from "./wallet";

/**
 * Challenges: hand in cards that match the criteria for an MX and/or pack reward. Tradeable cards go
 * back into the pack pool (RECIRCULATING) so the economy keeps moving; untradeable free/starter cards
 * are retired instead so they never leak into tradeable supply.
 */
export const CriteriaSchema = z
  .object({
    count: z.number().int().min(1).max(11),
    tiers: z.array(z.enum(["BRONZE", "SILVER", "GOLD"])).min(1).optional(),
    positions: z.array(z.enum(["GK", "DEF", "MID", "ATT"])).min(1).optional(),
    leagues: z.array(z.string()).min(1).optional(),
    maxPerClub: z.number().int().min(1).optional(),
    includeUntradeable: z.boolean().optional(),
  })
  .strict();

export function criteriaSummary(c: ChallengeCriteria) {
  const bits = [`${c.count} card${c.count > 1 ? "s" : ""}`];
  if (c.tiers) bits.push(c.tiers.map((t) => t[0] + t.slice(1).toLowerCase()).join("/") + " only");
  if (c.positions) bits.push(c.positions.join("/"));
  if (c.leagues) bits.push(c.leagues.join("/"));
  if (c.maxPerClub) bits.push(c.maxPerClub === 1 ? "all different clubs" : `max ${c.maxPerClub} per club`);
  if (c.includeUntradeable === false) bits.push("no free or starter cards");
  return bits.join(" · ");
}

function eligibleWhere(userId: string, c: ChallengeCriteria): Prisma.CardInstanceWhereInput {
  const player: Prisma.PlayerWhereInput = {};
  if (c.positions) player.position = { in: c.positions };
  if (c.leagues) player.club = { league: { code: { in: c.leagues } } };
  return {
    ownerId: userId,
    supplyState: "HELD",
    lock: "NONE",
    // Every card counts, untradeable ones included, unless a challenge explicitly excludes free/starter cards.
    template: { category: c.tiers ? { in: c.tiers } : undefined, edition: c.includeUntradeable === false ? "STANDARD" : undefined, player },
  };
}

export async function ensureDefaultChallenges() {
  for (const ch of DEFAULT_CHALLENGES) {
    await db.challenge.upsert({
      where: { code: ch.code },
      create: { code: ch.code, name: ch.name, description: ch.description, criteria: ch.criteria as never, rewardMinor: ch.rewardMinor, rewardPackSku: ch.rewardPackSku, maxPerUser: ch.maxPerUser },
      update: {},
    });
  }
}

export async function challengeBoard(userId: string, now = new Date()) {
  const list = await db.challenge.findMany({
    where: { active: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
    orderBy: { createdAt: "asc" },
  });
  const done = await db.challengeCompletion.groupBy({ by: ["challengeId"], where: { userId }, _count: { _all: true } });
  return Promise.all(
    list.map(async (ch) => {
      const criteria = ch.criteria as unknown as ChallengeCriteria;
      const eligible = await db.cardInstance.count({ where: eligibleWhere(userId, criteria) });
      const completed = done.find((d) => d.challengeId === ch.id)?._count._all ?? 0;
      return { ...ch, criteria, eligible, completed, summary: criteriaSummary(criteria), maxed: ch.maxPerUser !== null && completed >= ch.maxPerUser };
    }),
  );
}

/** Cards the manager could hand in, lowest value first (the sensible default picks). */
export async function eligibleCards(userId: string, challengeId: string) {
  const ch = await db.challenge.findUnique({ where: { id: challengeId } });
  if (!ch) throw new DomainError("NOT_FOUND", "Challenge not found.");
  const criteria = ch.criteria as unknown as ChallengeCriteria;
  const cards = await db.cardInstance.findMany({ where: eligibleWhere(userId, criteria), include: CARD_INCLUDE });
  const views = await enrichCards(cards);
  views.sort((a, b) => (a.valueMp ?? 0) - (b.valueMp ?? 0));
  return { challenge: { ...ch, criteria, summary: criteriaSummary(criteria) }, cards: views };
}

export async function completeChallenge(userId: string, challengeId: string, cardIds: string[], idempotencyKey: string, now = new Date()) {
  try {
    return await withTx(async (tx) => {
      const prior = await tx.challengeCompletion.findUnique({ where: { idempotencyKey } });
      if (prior) return prior;
      const ch = await tx.challenge.findUnique({ where: { id: challengeId } });
      if (!ch || !ch.active || (ch.startsAt && ch.startsAt > now) || (ch.endsAt && ch.endsAt <= now)) throw new DomainError("CLOSED", "This challenge isn't running.");
      const c = CriteriaSchema.parse(ch.criteria);
      const ids = [...new Set(cardIds)];
      if (ids.length !== c.count) throw new DomainError("COUNT", `Pick exactly ${c.count} card${c.count > 1 ? "s" : ""}.`);
      if (ch.maxPerUser !== null) {
        const n = await tx.challengeCompletion.count({ where: { userId, challengeId } });
        if (n >= ch.maxPerUser) throw new DomainError("MAXED", "You've completed this challenge the maximum number of times.");
      }
      await tx.$queryRaw`SELECT id FROM "CardInstance" WHERE id = ANY(${ids}::uuid[]) FOR UPDATE`;
      const cards = await tx.cardInstance.findMany({ where: { id: { in: ids }, ...eligibleWhere(userId, c) }, include: { template: { include: { player: true } } } });
      if (cards.length !== ids.length) throw new DomainError("NOT_ELIGIBLE", "Some of those cards don't meet the challenge rules (or are listed / in a squad).");
      if (c.maxPerClub) {
        const per = new Map<string, number>();
        for (const card of cards) per.set(card.template.player.clubId ?? "-", (per.get(card.template.player.clubId ?? "-") ?? 0) + 1);
        if ([...per.values()].some((n) => n > c.maxPerClub!)) throw new DomainError("CLUBS", `No more than ${c.maxPerClub} card${c.maxPerClub > 1 ? "s" : ""} from the same club.`);
      }

      const completion = await tx.challengeCompletion.create({ data: { challengeId, userId, cardIds: ids, idempotencyKey } });
      const closed = await tx.cardOwnership.updateMany({
        where: { cardId: { in: ids }, userId, releasedAt: null },
        data: { releasedAt: now, releasedVia: "COLLECTION_COMPLETION", releasedRef: `challenge:${completion.id}` },
      });
      if (closed.count !== ids.length) throw new Error("Ownership records out of sync");
      // Pool cards go back into packs (tradeable again for whoever pulls them next); minted free cards are retired.
      const pool = cards.filter((x) => x.template.edition === "STANDARD" && x.packable).map((x) => x.id);
      const minted = cards.filter((x) => !(x.template.edition === "STANDARD" && x.packable)).map((x) => x.id);
      if (pool.length) await tx.cardInstance.updateMany({ where: { id: { in: pool } }, data: { supplyState: "RECIRCULATING", ownerId: null, tradeStatus: "TRADEABLE", recycledCount: { increment: 1 } } });
      if (minted.length) await tx.cardInstance.updateMany({ where: { id: { in: minted } }, data: { supplyState: "RETIRED", ownerId: null } });
      await tx.favouriteCard.deleteMany({ where: { cardId: { in: ids } } });

      if (ch.rewardMinor > 0) await credit(tx, { userId, amountMinor: ch.rewardMinor, kind: "CHALLENGE_REWARD", refId: `challenge:${completion.id}`, note: ch.name });
      if (ch.rewardPackSku) await grantPack(tx, { userId, skuCode: ch.rewardPackSku, source: "REWARD", sourceRef: `challenge:${completion.id}` });
      return completion;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return db.challengeCompletion.findUniqueOrThrow({ where: { idempotencyKey } });
    throw e;
  }
}

export const ChallengeAdminSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9-]{3,40}$/, "Code: lowercase letters, numbers and dashes"),
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().min(3).max(240),
  criteria: CriteriaSchema,
  rewardMinor: z.number().int().min(0).max(10_000),
  rewardPackSku: z.string().optional(),
  maxPerUser: z.number().int().min(1).optional(),
  endsAt: z.coerce.date().optional(),
});

export async function createChallenge(adminId: string, input: z.input<typeof ChallengeAdminSchema>) {
  const d = ChallengeAdminSchema.parse(input);
  if (d.rewardMinor === 0 && !d.rewardPackSku) throw new DomainError("NO_REWARD", "Give the challenge an MX reward, a pack, or both.");
  return withTx(async (tx) => {
    const ch = await tx.challenge.create({ data: { ...d, criteria: d.criteria as never } });
    await audit(tx, { actorId: adminId, action: "challenge.create", entityType: "Challenge", entityId: ch.id, after: ch });
    return ch;
  });
}

export async function setChallengeActive(adminId: string, id: string, active: boolean) {
  return withTx(async (tx) => {
    const ch = await tx.challenge.update({ where: { id }, data: { active } });
    await audit(tx, { actorId: adminId, action: active ? "challenge.resume" : "challenge.pause", entityType: "Challenge", entityId: id });
    return ch;
  });
}
