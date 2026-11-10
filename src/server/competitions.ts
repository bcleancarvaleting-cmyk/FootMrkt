import { z } from "zod";
import { getRosterRules } from "@/domain/football/rules";
import { type SquadCard, type SquadIssue, validateSquad } from "@/domain/football/squad";
import { POSITIONS } from "@/domain/packs/config";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { isEnabled } from "./flags";
import { debit, fmtMp, lockWallet, release } from "./wallet";

/** Extra entry rules admins can set per match (on top of the format's tier rule). */
export const RequirementsSchema = z
  .object({
    leagues: z.array(z.string()).min(1).optional(),
    maxPerClub: z.number().int().min(1).max(11).optional(),
    /** Max total MP value of the starting seven. */
    maxSquadValueMp: z.number().int().min(1).optional(),
    tiers: z.array(z.enum(["BRONZE", "SILVER", "GOLD"])).min(1).optional(),
  })
  .strict();
export type Requirements = z.infer<typeof RequirementsSchema>;

export function requirementsSummary(r: Requirements, format: string) {
  const bits: string[] = [];
  if (format !== "OPEN") bits.push(`${format.split("_")[0][0]}${format.split("_")[0].slice(1).toLowerCase()} only`);
  if (r.tiers) bits.push(`${r.tiers.map((t) => t[0] + t.slice(1).toLowerCase()).join("/")} only`);
  if (r.leagues) bits.push(`${r.leagues.join("/")} players`);
  if (r.maxPerClub) bits.push(`max ${r.maxPerClub} per club`);
  if (r.maxSquadValueMp) bits.push(`starting XI ≤ ${r.maxSquadValueMp} MP`);
  return bits.length ? bits.join(" · ") : "Any players";
}

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
      Array<{ id: string; status: string; locksAt: Date; format: string; rosterRules: string; entryFeeMinor: number; requirements: unknown }>
    >`SELECT id, status, "locksAt", format, "rosterRules", "entryFeeMinor", requirements FROM "Competition" WHERE id = ${competitionId}::uuid FOR SHARE`;
    if (!comp) throw new DomainError("NOT_FOUND", "Competition not found.");
    if (comp.status !== "OPEN" || comp.locksAt <= new Date()) {
      throw new DomainError("LOCKED", "Entries for this competition are closed.");
    }
    const rules = getRosterRules(comp.rosterRules);
    const existing = await tx.competitionEntry.findUnique({ where: { competitionId_userId: { competitionId, userId } } });

    const cardIds = [...submission.starters.map((s) => s.cardId), ...submission.bench];
    const rows = await tx.$queryRaw<
      Array<{ id: string; ownerId: string | null; lock: string; lockRef: string | null; playerId: string; position: string; category: string; clubId: string | null; league: string | null }>
    >`SELECT ci.id, ci."ownerId", ci."lock", ci."lockRef", t."playerId", p.position::text AS position, t.category::text AS category,
             p."clubId", l.code AS league
      FROM "CardInstance" ci JOIN "CardTemplate" t ON t.id = ci."templateId" JOIN "Player" p ON p.id = t."playerId"
      LEFT JOIN "Club" c ON c.id = p."clubId" LEFT JOIN "League" l ON l.id = c."leagueId"
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
    issues.push(...(await checkRequirements(tx, comp.requirements, rows, submission.starters.map((x) => x.cardId))));
    if (issues.length) throw new SquadInvalidError(issues);

    const entry = existing
      ? await tx.competitionEntry.update({ where: { id: existing.id }, data: { formation: submission.formation, status: "ACTIVE" } })
      : await tx.competitionEntry.create({ data: { competitionId, userId, formation: submission.formation } });

    // Entry fee (set by admins) — charged once, on first entry, and only once PAID_ENTRY is legally cleared.
    if (!existing && comp.entryFeeMinor > 0) {
      if (!(await isEnabled("PAID_ENTRY"))) throw new DomainError("FEATURE_DISABLED", "Paid entry isn't available yet — this match opens once our legal review is complete.");
      await lockWallet(tx, userId);
      await debit(tx, { userId, amountMinor: comp.entryFeeMinor, kind: "ENTRY_FEE", refId: `entry:${entry.id}`, note: `Entry: ${fmtMp(comp.entryFeeMinor)}` });
    }

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
    if (comp.entryFeeMinor > 0) {
      await lockWallet(tx, userId);
      await release(tx, { userId, refId: `entry:${entry.id}`, kind: "ENTRY_REFUND", note: `${comp.name} — entry refunded` });
    }
    await tx.cardInstance.updateMany({ where: { lock: "COMPETITION", lockRef: entry.id }, data: { lock: "NONE", lockRef: null } });
    await tx.competitionSelection.deleteMany({ where: { entryId: entry.id } });
    await tx.competitionEntry.delete({ where: { id: entry.id } });
  });
}

async function checkRequirements(
  tx: Parameters<Parameters<typeof withTx>[0]>[0],
  raw: unknown,
  rows: Array<{ id: string; playerId: string; category: string; clubId: string | null; league: string | null }>,
  starterIds: string[],
): Promise<SquadIssue[]> {
  const parsed = RequirementsSchema.safeParse(raw ?? {});
  if (!parsed.success) return [];
  const r = parsed.data;
  const issues: SquadIssue[] = [];
  const picked = rows;
  if (r.tiers) for (const c of picked) if (!r.tiers.includes(c.category as never)) issues.push({ code: "UNKNOWN_CARD", message: `Only ${r.tiers.join("/").toLowerCase()} cards can be entered`, cardId: c.id });
  if (r.leagues) for (const c of picked) if (!c.league || !r.leagues.includes(c.league)) issues.push({ code: "UNKNOWN_CARD", message: `Only ${r.leagues.join("/")} players can be entered`, cardId: c.id });
  if (r.maxPerClub) {
    const per = new Map<string, number>();
    for (const c of picked) per.set(c.clubId ?? "-", (per.get(c.clubId ?? "-") ?? 0) + 1);
    if ([...per.values()].some((n) => n > r.maxPerClub!)) issues.push({ code: "UNKNOWN_CARD", message: `No more than ${r.maxPerClub} players from one club` });
  }
  if (r.maxSquadValueMp) {
    const starters = picked.filter((c) => starterIds.includes(c.id));
    const vals = await tx.$queryRaw<Array<{ total: number | null }>>`
      SELECT SUM(v."valueMp")::int AS total FROM (
        SELECT DISTINCT ON (t."playerId", t.category) mv."valueMp"
        FROM "CardInstance" ci JOIN "CardTemplate" t ON t.id = ci."templateId"
        JOIN "MPValuation" mv ON mv."playerId" = t."playerId" AND mv.category = t.category
        WHERE ci.id = ANY(${starters.map((c) => c.id)}::uuid[])
        ORDER BY t."playerId", t.category, mv."computedAt" DESC
      ) v`;
    const total = vals[0]?.total ?? 0;
    if (total > r.maxSquadValueMp) issues.push({ code: "UNKNOWN_CARD", message: `Your starters are worth ${total} MP — the limit is ${r.maxSquadValueMp} MP` });
  }
  return issues;
}

/** Admin: set a match's entry fee (MP) and extra requirements. */
/** "1=10, 2-3=5" → £ prizes by finishing position. */
export function parsePrizes(text: string) {
  const rules: Array<{ rankFrom: number; rankTo: number; cashMinor: number }> = [];
  for (const part of text.split(/[,\n]/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?\s*=\s*£?\s*(\d+(?:\.\d{1,2})?)$/.exec(part);
    if (!m) throw new DomainError("PRIZES", `Couldn't read “${part}” — use e.g. 1=10, 2-3=5`);
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (to < from) throw new DomainError("PRIZES", `“${part}”: the range is back to front.`);
    rules.push({ rankFrom: from, rankTo: to, cashMinor: Math.round(Number(m[3]) * 100) });
  }
  return rules;
}

export function prizesSummary(rewards: unknown) {
  const cash = ((rewards as Array<{ rankFrom: number; rankTo: number; cashMinor?: number }>) ?? []).filter((r) => r.cashMinor);
  return cash.map((r) => `${r.rankFrom === r.rankTo ? `#${r.rankFrom}` : `#${r.rankFrom}–${r.rankTo}`} £${(r.cashMinor! / 100).toFixed(r.cashMinor! % 100 ? 2 : 0)}`).join(" · ");
}

export async function updateCompetitionRules(adminId: string, competitionId: string, input: { entryFeeMinor: number; requirements: unknown; prizes?: string }) {
  const fee = z.number().int().min(0).max(10_000).parse(input.entryFeeMinor);
  const requirements = RequirementsSchema.parse(input.requirements ?? {});
  const cashRules = input.prizes !== undefined ? parsePrizes(input.prizes) : null;
  return withTx(async (tx) => {
    const before = await tx.competition.findUniqueOrThrow({ where: { id: competitionId } });
    if (!["UPCOMING", "OPEN"].includes(before.status)) throw new DomainError("LOCKED", "Rules can only change before the match locks.");
    const entries = await tx.competitionEntry.count({ where: { competitionId } });
    if (entries > 0 && fee !== before.entryFeeMinor) throw new DomainError("HAS_ENTRIES", "Managers have already entered — the entry fee can't change now.");
    const keep = ((before.rewards as Array<{ cashMinor?: number }>) ?? []).filter((r) => !r.cashMinor);
    const rewards = cashRules ? [...keep, ...cashRules] : (before.rewards as never);
    const after = await tx.competition.update({ where: { id: competitionId }, data: { entryFeeMinor: fee, requirements, rewards } });
    await audit(tx, { actorId: adminId, action: "competition.rules", entityType: "Competition", entityId: competitionId, before: { fee: before.entryFeeMinor, req: before.requirements }, after: { fee, requirements } });
    return after;
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
