import { z } from "zod";
import { getRosterRules } from "@/domain/football/rules";
import { type SquadCard, validateSquad } from "@/domain/football/squad";
import { POSITIONS } from "@/domain/packs/config";
import { Prisma } from "@/generated/prisma/client";
import { db, withTx } from "./db";
import { attachBooster } from "./boosters";
import { DomainError } from "./errors";
import { RequirementsSchema, SquadInvalidError } from "./competitions";
import { draftPrice } from "@/domain/football/draft";

export { draftPrice };

/**
 * Free draft: a match anyone can enter without owning cards. Pick 7 starters + 4 subs from every
 * player in the match's leagues, within a total MX budget (current card values) and a per-club cap.
 * Same formations, captain and auto-subs as every other match.
 */
export const DraftSchema = z.object({
  formation: z.string().max(10),
  starters: z.array(z.object({ playerId: z.string().uuid(), position: z.enum(POSITIONS) })).max(11),
  bench: z.array(z.string().uuid()).max(11),
  captain: z.string().uuid().optional(),
  viceCaptain: z.string().uuid().optional(),
  boosterId: z.string().uuid().nullable().optional(),
  /** Player id carrying the booster. */
  boostedOn: z.string().uuid().nullable().optional(),
});

/** Every player who can be drafted for a match, with today's MX value (their current tier's card). */
export async function draftPool(leagues: string[] | undefined) {
  const rows = await db.$queryRaw<Array<{ playerId: string; position: string; category: string; valueMp: number | null; marketValueGbp: number | null; clubId: string; clubCode: string; league: string }>>`
    SELECT p.id AS "playerId", p.position::text AS position, t.category::text AS category, v."valueMp", p."marketValueGbp", c.id AS "clubId", c.code AS "clubCode", l.code AS league
    FROM "Player" p
    JOIN "CardTemplate" t ON t."playerId" = p.id AND t.edition = 'STANDARD' AND t.active
    JOIN "Club" c ON c.id = p."clubId" JOIN "League" l ON l.id = c."leagueId"
    LEFT JOIN LATERAL (SELECT "valueMp" FROM "MPValuation" mv WHERE mv."playerId" = p.id AND mv.category = t.category ORDER BY "computedAt" DESC LIMIT 1) v ON true
    WHERE p.active ${leagues?.length ? Prisma.sql`AND l.code = ANY(${leagues}::text[])` : Prisma.empty}`;
  return rows;
}

export async function submitDraftEntry(userId: string, competitionId: string, input: unknown) {
  const sub = DraftSchema.parse(input);
  return withTx(async (tx) => {
    const comp = await tx.competition.findUniqueOrThrow({ where: { id: competitionId } });
    if (comp.status !== "OPEN" || comp.locksAt <= new Date()) throw new DomainError("LOCKED", "Entries for this match are closed.");
    const req = RequirementsSchema.parse(comp.requirements ?? {});
    if (!req.draftBudgetMx) throw new DomainError("NOT_DRAFT", "This match uses your own cards.");
    const ids = [...sub.starters.map((s) => s.playerId), ...sub.bench];
    const pool = new Map((await draftPool(req.leagues)).map((p) => [p.playerId, p]));
    const cards = new Map<string, SquadCard>();
    for (const id of ids) {
      const p = pool.get(id);
      if (p) cards.set(id, { cardId: id, playerId: id, playerPosition: p.position as SquadCard["playerPosition"], category: p.category as SquadCard["category"] });
    }
    const rules = getRosterRules(comp.rosterRules);
    const issues = validateSquad(rules, "OPEN", { formation: sub.formation, starters: sub.starters.map((s) => ({ cardId: s.playerId, position: s.position })), bench: sub.bench }, cards);
    const cost = (id: string) => {
      const p = pool.get(id);
      return p ? draftPrice(p.valueMp, p.category, p.marketValueGbp) : 0;
    };
    const spent = ids.reduce((n, id) => n + cost(id), 0);
    if (spent > req.draftBudgetMx) issues.push({ code: "UNKNOWN_CARD", message: `Your squad costs ${spent} MX — the budget is ${req.draftBudgetMx} MX` });
    if (req.maxPerClub) {
      const perClub = new Map<string, number>();
      for (const id of ids) {
        const c = pool.get(id)?.clubCode;
        if (c) perClub.set(c, (perClub.get(c) ?? 0) + 1);
      }
      const over = [...perClub].filter(([, n]) => n > req.maxPerClub!);
      if (over.length) issues.push({ code: "UNKNOWN_CARD", message: `Max ${req.maxPerClub} players from one club (${over.map(([c]) => c).join(", ")})` });
    }
    if (sub.captain && !sub.starters.some((s) => s.playerId === sub.captain)) issues.push({ code: "UNKNOWN_CARD", message: "Your captain must be one of your starting seven" });
    if (sub.viceCaptain && (!sub.starters.some((s) => s.playerId === sub.viceCaptain) || sub.viceCaptain === sub.captain)) {
      issues.push({ code: "UNKNOWN_CARD", message: "Your vice-captain must be a different player in your starting seven" });
    }
    if (issues.length) throw new SquadInvalidError(issues);

    const existing = await tx.competitionEntry.findUnique({ where: { competitionId_userId: { competitionId, userId } } });
    const entry = existing
      ? await tx.competitionEntry.update({ where: { id: existing.id }, data: { formation: sub.formation, status: "ACTIVE" } })
      : await tx.competitionEntry.create({ data: { competitionId, userId, formation: sub.formation } });
    await tx.competitionSelection.deleteMany({ where: { entryId: entry.id } });
    await tx.competitionSelection.createMany({
      data: [
        ...sub.starters.map((s, i) => ({ entryId: entry.id, cardId: null, playerId: s.playerId, slot: "STARTER" as const, position: s.position, order: i + 1, isCaptain: s.playerId === sub.captain, isViceCaptain: !!sub.viceCaptain && s.playerId === sub.viceCaptain })),
        ...sub.bench.map((id, i) => ({ entryId: entry.id, cardId: null, playerId: id, slot: "BENCH" as const, position: cards.get(id)!.playerPosition, order: i + 1 })),
      ],
    });
    await attachBooster(tx, userId, entry.id, comp, sub.boosterId, sub.boostedOn);
    return entry;
  });
}
