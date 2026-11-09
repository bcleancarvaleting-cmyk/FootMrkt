import { z } from "zod";
import { getRosterRules } from "@/domain/football/rules";
import { type SquadCard, type SquadIssue, validateSquad } from "@/domain/football/squad";
import { POSITIONS } from "@/domain/packs/config";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { DomainError } from "./errors";

export const SquadSubmissionSchema = z.object({
  formation: z.string().max(10),
  starters: z.array(z.object({ cardId: z.string().uuid(), position: z.enum(POSITIONS) })).max(11),
  bench: z.array(z.string().uuid()).max(11),
});

export class SquadInvalidError extends DomainError {
  constructor(public readonly issues: SquadIssue[]) {
    super("SQUAD_INVALID", issues.map((i) => i.message).join(" · "), issues);
  }
}

/**
 * Enter or update a squad. Everything is re-validated server-side (spec §6.2): competition
 * state and deadline, card ownership, card availability (not listed / not in another
 * competition), and roster rules. Selected cards are locked to the entry until settlement.
 */
export async function submitEntry(userId: string, competitionId: string, input: unknown) {
  const submission = SquadSubmissionSchema.parse(input);
  return withTx(async (tx) => {
    const [comp] = await tx.$queryRaw<
      Array<{ id: string; status: string; locksAt: Date; format: string; rosterRules: string }>
    >`SELECT id, status, "locksAt", format, "rosterRules" FROM "Competition" WHERE id = ${competitionId}::uuid FOR SHARE`;
    if (!comp) throw new DomainError("NOT_FOUND", "Competition not found.");
    if (comp.status !== "OPEN" || comp.locksAt <= new Date()) {
      throw new DomainError("LOCKED", "Entries for this competition are closed.");
    }
    const rules = getRosterRules(comp.rosterRules);
    const existing = await tx.competitionEntry.findUnique({ where: { competitionId_userId: { competitionId, userId } } });

    const cardIds = [...submission.starters.map((s) => s.cardId), ...submission.bench];
    const rows = await tx.$queryRaw<
      Array<{ id: string; ownerId: string | null; lock: string; lockRef: string | null; playerId: string; position: string; category: string }>
    >`SELECT ci.id, ci."ownerId", ci."lock", ci."lockRef", t."playerId", p.position::text AS position, t.category::text AS category
      FROM "CardInstance" ci JOIN "CardTemplate" t ON t.id = ci."templateId" JOIN "Player" p ON p.id = t."playerId"
      WHERE ci.id = ANY(${cardIds}::uuid[]) AND ci."ownerId" = ${userId}::uuid AND ci."supplyState" = 'HELD'
      FOR UPDATE OF ci`;
    const cards = new Map<string, SquadCard>();
    const unavailable: SquadIssue[] = [];
    for (const r of rows) {
      const lockedElsewhere = r.lock !== "NONE" && !(r.lock === "COMPETITION" && existing && r.lockRef === existing.id);
      if (lockedElsewhere) {
        unavailable.push({
          code: "UNKNOWN_CARD",
          message: r.lock === "LISTED" ? "A selected card is listed on the market" : "A selected card is already in another competition",
          cardId: r.id,
        });
        continue;
      }
      cards.set(r.id, {
        cardId: r.id,
        playerId: r.playerId,
        playerPosition: r.position as SquadCard["playerPosition"],
        category: r.category as SquadCard["category"],
      });
    }
    const issues = [...unavailable, ...validateSquad(rules, comp.format as never, submission, cards).filter((i) => !(i.code === "UNKNOWN_CARD" && unavailable.some((u) => u.cardId === i.cardId)))];
    if (issues.length) throw new SquadInvalidError(issues);

    const entry = existing
      ? await tx.competitionEntry.update({ where: { id: existing.id }, data: { formation: submission.formation, status: "ACTIVE" } })
      : await tx.competitionEntry.create({ data: { competitionId, userId, formation: submission.formation } });

    // Release cards dropped from the squad, then lock the new selection to this entry.
    await tx.cardInstance.updateMany({
      where: { lock: "COMPETITION", lockRef: entry.id, id: { notIn: cardIds } },
      data: { lock: "NONE", lockRef: null },
    });
    await tx.cardInstance.updateMany({ where: { id: { in: cardIds } }, data: { lock: "COMPETITION", lockRef: entry.id } });
    await tx.competitionSelection.deleteMany({ where: { entryId: entry.id } });
    await tx.competitionSelection.createMany({
      data: [
        ...submission.starters.map((s, i) => ({
          entryId: entry.id,
          cardId: s.cardId,
          playerId: cards.get(s.cardId)!.playerId,
          slot: "STARTER" as const,
          position: s.position,
          order: i + 1,
        })),
        ...submission.bench.map((cardId, i) => ({
          entryId: entry.id,
          cardId,
          playerId: cards.get(cardId)!.playerId,
          slot: "BENCH" as const,
          position: cards.get(cardId)!.playerPosition,
          order: i + 1,
        })),
      ],
    });
    return entry;
  });
}

export async function withdrawEntry(userId: string, competitionId: string) {
  return withTx(async (tx) => {
    const comp = await tx.competition.findUniqueOrThrow({ where: { id: competitionId } });
    if (comp.status !== "OPEN" || comp.locksAt <= new Date()) throw new DomainError("LOCKED", "This competition is locked.");
    const entry = await tx.competitionEntry.findUnique({ where: { competitionId_userId: { competitionId, userId } } });
    if (!entry) return;
    await tx.cardInstance.updateMany({ where: { lock: "COMPETITION", lockRef: entry.id }, data: { lock: "NONE", lockRef: null } });
    await tx.competitionSelection.deleteMany({ where: { entryId: entry.id } });
    await tx.competitionEntry.delete({ where: { id: entry.id } });
  });
}

/** Move competitions through their windows. Safe to run repeatedly (scheduled job). */
export async function advanceCompetitionWindows(now = new Date()) {
  const opened = await db.competition.updateMany({
    where: { status: "UPCOMING", entryOpensAt: { lte: now } },
    data: { status: "OPEN" },
  });
  const due = await db.competition.findMany({ where: { status: "OPEN", locksAt: { lte: now } }, select: { id: true } });
  for (const c of due) await lockCompetition(c.id, null);
  return { opened: opened.count, locked: due.length };
}

export async function lockCompetition(competitionId: string, actorId: string | null) {
  await withTx(async (tx) => {
    const updated = await tx.competition.updateMany({
      where: { id: competitionId, status: { in: ["UPCOMING", "OPEN"] } },
      data: { status: "LOCKED" },
    });
    if (updated.count) await audit(tx, { actorId, action: "competition.lock", entityType: "Competition", entityId: competitionId });
  });
}

export async function leaderboard(competitionId: string, limit = 100) {
  const comp = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  const settled = comp.status === "SETTLED";
  const entries = await db.competitionEntry.findMany({
    where: { competitionId, status: "ACTIVE" },
    include: { user: { select: { displayName: true } } },
    orderBy: settled ? [{ rank: "asc" }] : [{ provisionalPoints: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    take: limit,
  });
  let rank = 0;
  return entries.map((e, i) => {
    const pts = settled ? e.finalPoints : e.provisionalPoints;
    if (!settled && (i === 0 || pts !== (settled ? entries[i - 1].finalPoints : entries[i - 1].provisionalPoints))) rank = i + 1;
    return {
      entryId: e.id,
      userId: e.userId,
      displayName: e.user.displayName,
      points: pts ?? 0,
      rank: settled ? e.rank ?? i + 1 : rank,
      final: settled,
    };
  });
}
