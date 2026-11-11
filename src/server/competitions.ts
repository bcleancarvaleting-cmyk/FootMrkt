import { attachBooster, releaseBooster } from "./boosters";
import { z } from "zod";
import { toCrest } from "@/lib/crest";
import { assertLoansUsable } from "./loans";
import { getRosterRules } from "@/domain/football/rules";
import { type SquadCard, type SquadIssue, validateSquad } from "@/domain/football/squad";
import { POSITIONS } from "@/domain/packs/config";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { isEnabled } from "./flags";
import { grantPack } from "./packs";
import { REFERRAL_PACK_CODE } from "@/config/packs";
import { debit, fmtMp, lockWallet, release } from "./wallet";
import { potTotal } from "@/domain/football/prizes";

/** Extra entry rules admins can set per match (on top of the format's tier rule). */
export const RequirementsSchema = z
  .object({
    leagues: z.array(z.string()).min(1).optional(),
    /** Only these clubs' players (club codes), e.g. ["CHE","MUN"] for a Chelsea v Man Utd match. */
    clubs: z.array(z.string()).min(1).max(100).optional(),
    maxPerClub: z.number().int().min(1).max(11).optional(),
    /** Max total MX value of the starting seven. */
    maxSquadValueMp: z.number().int().min(1).optional(),
    tiers: z.array(z.enum(["BRONZE", "SILVER", "GOLD"])).min(1).optional(),
    /** Only Founding Members can enter (e.g. the founders' freeroll). */
    foundersOnly: z.boolean().optional(),
    /**
     * Only free cards (Starter Pack, welcome gifts, free drops — the minted STARTER edition) may be
     * picked, so buying packs or cards can't improve anyone's chance of winning. Required for £ prizes.
     */
    freeCardsOnly: z.boolean().optional(),
    /**
     * Free draft: pick any players (no cards needed) within this total MX budget for all 11.
     * Points earn XP like any match; picks never count towards a card's history.
     */
    draftBudgetMx: z.number().int().min(10).max(1000).optional(),
  })
  .strict();
export type Requirements = z.infer<typeof RequirementsSchema>;

export function requirementsSummary(r: Requirements, format: string) {
  const bits: string[] = [];
  if (r.draftBudgetMx) bits.push(`Free draft · any players · ${r.draftBudgetMx} MX budget`);
  if (r.freeCardsOnly) bits.push("Free cards only");
  if (r.foundersOnly) bits.push("Founding members only");
  if (format !== "OPEN") bits.push(`${format.split("_")[0][0]}${format.split("_")[0].slice(1).toLowerCase()} only`);
  if (r.tiers) bits.push(`${r.tiers.map((t) => t[0] + t.slice(1).toLowerCase()).join("/")} only`);
  if (r.clubs) bits.push(`${r.clubs.join(" v ")} players only`);
  if (r.leagues) bits.push(`${r.leagues.join("/")} players`);
  if (r.maxPerClub) bits.push(`max ${r.maxPerClub} per club`);
  if (r.maxSquadValueMp) bits.push(`starting XI ≤ ${r.maxSquadValueMp} MX`);
  return bits.length ? bits.join(" · ") : "Any players";
}

export const SquadSubmissionSchema = z.object({
  formation: z.string().max(10),
  starters: z.array(z.object({ cardId: z.string().uuid(), position: z.enum(POSITIONS) })).max(11),
  bench: z.array(z.string().uuid()).max(11),
  /** Card id of the captain (must be a starter): double points, up or down. */
  captain: z.string().uuid().optional(),
  /** Card id of the vice-captain (a different starter): doubles instead if the captain doesn't play. */
  viceCaptain: z.string().uuid().optional(),
  /** A weekly booster to play on this entry (null/absent = none). */
  boosterId: z.string().uuid().nullable().optional(),
  /** Card id of the player carrying the booster. */
  boostedOn: z.string().uuid().nullable().optional(),
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
      Array<{ id: string; status: string; locksAt: Date; format: string; rosterRules: string; entryFeeMinor: number; requirements: unknown; gameweekId: string; rewards: unknown }>
    >`SELECT id, status, "locksAt", format, "rosterRules", "entryFeeMinor", requirements, "gameweekId", rewards FROM "Competition" WHERE id = ${competitionId}::uuid FOR SHARE`;
    if (!comp) throw new DomainError("NOT_FOUND", "Competition not found.");
    if (comp.status !== "OPEN" || comp.locksAt <= new Date()) {
      throw new DomainError("LOCKED", "Entries for this competition are closed.");
    }
    const rules = getRosterRules(comp.rosterRules);
    if (RequirementsSchema.safeParse(comp.requirements ?? {}).data?.draftBudgetMx) {
      throw new DomainError("DRAFT_MATCH", "This is a free draft match — pick players from the draft list, not your cards.");
    }
    if (RequirementsSchema.safeParse(comp.requirements ?? {}).data?.foundersOnly) {
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { foundingNumber: true } });
      if (!u.foundingNumber) throw new DomainError("FOUNDERS_ONLY", "This match is for Founding Members only.");
    }
    const existing = await tx.competitionEntry.findUnique({ where: { competitionId_userId: { competitionId, userId } } });

    const cardIds = [...submission.starters.map((s) => s.cardId), ...submission.bench];
    const rows = await tx.$queryRaw<
      Array<{ id: string; ownerId: string | null; lock: string; lockRef: string | null; playerId: string; position: string; category: string; edition: string; clubId: string | null; clubCode: string | null; league: string | null }>
    >`SELECT ci.id, ci."ownerId", ci."lock", ci."lockRef", t."playerId", p.position::text AS position, t.category::text AS category, t.edition::text AS edition,
             p."clubId", c.code AS "clubCode", l.code AS league
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
    if (submission.captain && !submission.starters.some((s) => s.cardId === submission.captain)) {
      issues.push({ code: "UNKNOWN_CARD", message: "Your captain must be one of your starting seven", cardId: submission.captain });
    }
    if (submission.viceCaptain && (!submission.starters.some((s) => s.cardId === submission.viceCaptain) || submission.viceCaptain === submission.captain)) {
      issues.push({ code: "UNKNOWN_CARD", message: "Your vice-captain must be a different player in your starting seven", cardId: submission.viceCaptain });
    }
    if (issues.length) throw new SquadInvalidError(issues);
    // Loan players only play in the first gameweeks the manager enters.
    await assertLoansUsable(tx, userId, comp.gameweekId, rows.filter((r) => r.edition === "LOAN").map((r) => r.id));

    if (!existing) await rewardReferrer(tx, userId);
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
          isCaptain: s.cardId === submission.captain,
          isViceCaptain: !!submission.viceCaptain && s.cardId === submission.viceCaptain,
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
    await attachBooster(tx, userId, entry.id, submission.boosterId, submission.boostedOn);
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
    await releaseBooster(tx, entry.id);
    await tx.competitionEntry.delete({ where: { id: entry.id } });
  });
}

async function checkRequirements(
  tx: Parameters<Parameters<typeof withTx>[0]>[0],
  raw: unknown,
  rows: Array<{ id: string; playerId: string; category: string; edition: string; clubId: string | null; clubCode: string | null; league: string | null }>,
  starterIds: string[],
): Promise<SquadIssue[]> {
  const parsed = RequirementsSchema.safeParse(raw ?? {});
  if (!parsed.success) return [];
  const r = parsed.data;
  const issues: SquadIssue[] = [];
  const picked = rows;
  if (r.freeCardsOnly) for (const c of picked) if (c.edition !== "STARTER" && c.edition !== "LOAN") issues.push({ code: "UNKNOWN_CARD", message: "Only free cards (Starter Pack, loans, welcome gifts, free drops) can be entered", cardId: c.id });
  if (r.tiers) for (const c of picked) if (!r.tiers.includes(c.category as never)) issues.push({ code: "UNKNOWN_CARD", message: `Only ${r.tiers.join("/").toLowerCase()} cards can be entered`, cardId: c.id });
  if (r.clubs) for (const c of picked) if (!c.clubCode || !r.clubs.includes(c.clubCode)) issues.push({ code: "UNKNOWN_CARD", message: `Only ${r.clubs.join(" and ")} players can be entered`, cardId: c.id });
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
    if (total > r.maxSquadValueMp) issues.push({ code: "UNKNOWN_CARD", message: `Your starters are worth ${total} MX — the limit is ${r.maxSquadValueMp} MX` });
  }
  return issues;
}

/**
 * Guardrail: £ prizes only on matches that are free to enter AND limited to free cards, so nothing
 * anyone bought (MX, packs, cards) can buy a better chance of real money. Matches with an MX entry
 * fee or open to bought cards pay in-game prizes only (MX, packs).
 */
export function assertPrizeRules(feeMinor: number, req: Requirements, rewards: Array<{ cashMinor?: number }>, anyCards = false) {
  if (!rewards.some((r) => (r.cashMinor ?? 0) > 0)) return;
  if (feeMinor > 0) throw new DomainError("PRIZE_RULES", "£ prizes are only allowed on free-entry matches. Matches with an MX entry fee can give MX or pack prizes.");
  if (!req.freeCardsOnly && !anyCards) throw new DomainError("PRIZE_RULES", "£ prizes need the 'Free cards only' rule, so bought cards can't improve anyone's chances. (Admin → Settings: 'Cash prizes with any cards'.)");
}

const cashAnyCards = async () => (await (await import("./settings")).getSetting("cashAnyCards")) === 1;

/** Put a tier cup's weekly £ pool on this week's cup (if it hasn't locked); pack prizes are kept. */
export async function applyPrizePool(templateKey: string, text: string) {
  const cash = parsePrizes(text);
  const comps = await db.competition.findMany({ where: { status: { in: ["UPCOMING", "OPEN"] }, code: { endsWith: `-${templateKey}` } } });
  for (const c of comps) {
    const keep = ((c.rewards as Array<{ cashMinor?: number }>) ?? []).filter((r) => !r.cashMinor);
    await db.competition.update({ where: { id: c.id }, data: { rewards: [...keep, ...cash] as never } });
  }
  return comps.length;
}

/** Refer a friend: the first time a referred manager enters a match, their referrer gets a free pack. */
async function rewardReferrer(tx: Parameters<Parameters<typeof withTx>[0]>[0], userId: string) {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { referredById: true } });
  if (!u?.referredById) return;
  const ref = `referral:${userId}`;
  if (await tx.packEntitlement.findUnique({ where: { sourceRef: ref } })) return;
  const { getText } = await import("./settings");
  const sku = (await getText("referralRewardSku")) || REFERRAL_PACK_CODE;
  await grantPack(tx, { userId: u.referredById, skuCode: sku, source: "REWARD", sourceRef: ref });
}

/** Admin: set a match's entry fee (MX) and extra requirements. */
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
  if (!cash.length) return "";
  const gbp = (m: number) => `£${(m / 100).toFixed(m % 100 ? 2 : 0)}`;
  const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
  const parts = cash.map((r) => `${r.rankFrom === r.rankTo ? ord(r.rankFrom) : `${ord(r.rankFrom)}–${ord(r.rankTo)}`} ${gbp(r.cashMinor!)}${r.rankFrom === r.rankTo ? "" : " each"}`);
  return `${gbp(potTotal(cash))} pot · ${parts.join(" · ")} · ties split`;
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
    assertPrizeRules(fee, requirements, cashRules ?? ((before.rewards as Array<{ cashMinor?: number }>) ?? []), await cashAnyCards());
    const keep = ((before.rewards as Array<{ cashMinor?: number }>) ?? []).filter((r) => !r.cashMinor);
    const rewards = cashRules ? [...keep, ...cashRules] : (before.rewards as never);
    const after = await tx.competition.update({ where: { id: competitionId }, data: { entryFeeMinor: fee, requirements, rewards } });
    await audit(tx, { actorId: adminId, action: "competition.rules", entityType: "Competition", entityId: competitionId, before: { fee: before.entryFeeMinor, req: before.requirements }, after: { fee, requirements } });
    return after;
  });
}

export const PRIZE_PACKS = { BRONZE: "football-eng-bronze", SILVER: "football-eng-silver", GOLD: "football-eng-gold" } as const;
export const NewMatchSchema = z.object({
  gameweekId: z.string().uuid(),
  name: z.string().trim().max(40).optional(),
  /** A head-to-head match on one real fixture: only the two clubs' players can be picked. */
  fixtureId: z.string().uuid().optional(),
  /** The real fixtures this match covers (e.g. only League Two, or a few midweek games): only those clubs' players count. */
  fixtureIds: z.array(z.string().uuid()).max(200).optional(),
  kind: z.enum(["CARDS", "DRAFT"]).default("CARDS"),
  league: z.string().max(10).optional(),
  tier: z.enum(["BRONZE", "SILVER", "GOLD"]).optional(),
  freeCardsOnly: z.boolean().default(false),
  foundersOnly: z.boolean().default(false),
  maxPerClub: z.number().int().min(1).max(7).optional(),
  draftBudgetMx: z.number().int().min(10).max(1000).optional(),
  entryFeeMinor: z.number().int().min(0).max(10_000).default(0),
  winnerPack: z.enum(["BRONZE", "SILVER", "GOLD"]).optional(),
  top3Pack: z.enum(["BRONZE", "SILVER", "GOLD"]).optional(),
  everyonePack: z.enum(["BRONZE", "SILVER", "GOLD"]).optional(),
  prizes: z.string().max(200).optional(),
});

/** Admin → Matches: add an extra match to a gameweek that hasn't locked yet (e.g. a League One Cup). */
export async function createMatch(adminId: string, input: z.input<typeof NewMatchSchema>) {
  const m = NewMatchSchema.parse(input);
  const ids = [...new Set([...(m.fixtureIds ?? []), ...(m.fixtureId ? [m.fixtureId] : [])])];
  const picked = ids.length ? await db.fixture.findMany({ where: { id: { in: ids } }, include: { homeClub: true, awayClub: true } }) : [];
  if (picked.length !== ids.length) throw new DomainError("FIXTURE", "Unknown fixture.");
  if (new Set(picked.map((f) => f.gameweekId)).size > 1) throw new DomainError("FIXTURE", "Pick fixtures from one gameweek.");
  const fixture = picked.length ? picked[0] : null;
  if (fixture) m.gameweekId = fixture.gameweekId;
  const name = m.name || (picked.length === 1 ? `${fixture!.homeClub.shortName} v ${fixture!.awayClub.shortName}` : "");
  if (name.length < 3) throw new DomainError("NAME", "Give the match a name.");
  const gw = await db.gameweek.findUnique({ where: { id: m.gameweekId }, include: { competitions: { select: { locksAt: true, entryOpensAt: true, code: true, rosterRules: true, scoringRules: true } } } });
  if (!gw || !["UPCOMING", "OPEN"].includes(gw.status)) throw new DomainError("LOCKED", "Pick a gameweek that's still open for entries.");
  if (m.league && !(await db.league.findUnique({ where: { code: m.league } }))) throw new DomainError("LEAGUE", "Unknown league.");
  if (m.kind === "DRAFT" && m.tier) throw new DomainError("RULES", "Free draft matches use any players, so there's no card tier.");
  const requirements = RequirementsSchema.parse({
    leagues: m.league && !fixture ? [m.league] : undefined,
    clubs: picked.length ? [...new Set(picked.flatMap((f) => [f.homeClub.code, f.awayClub.code]))] : undefined,
    freeCardsOnly: m.kind === "CARDS" && m.freeCardsOnly ? true : undefined,
    foundersOnly: m.foundersOnly || undefined,
    // Two clubs have to fill 11 places, so a per-club cap below 6 can't be met.
    maxPerClub: picked.length === 1 && m.maxPerClub && m.maxPerClub < 6 ? undefined : m.maxPerClub,
    draftBudgetMx: m.kind === "DRAFT" ? (m.draftBudgetMx ?? 70) : undefined,
  });
  const cash = m.prizes?.trim() ? parsePrizes(m.prizes) : [];
  assertPrizeRules(m.entryFeeMinor, requirements, cash, await cashAnyCards());
  const rewards = [
    ...(m.winnerPack ? [{ rankFrom: 1, rankTo: 1, packSkuCode: PRIZE_PACKS[m.winnerPack] }] : []),
    ...(m.top3Pack ? [{ rankFrom: m.winnerPack ? 2 : 1, rankTo: 3, packSkuCode: PRIZE_PACKS[m.top3Pack] }] : []),
    ...(m.everyonePack ? [{ rankFrom: m.winnerPack || m.top3Pack ? (m.top3Pack ? 4 : 2) : 1, rankTo: 1_000_000, packSkuCode: PRIZE_PACKS[m.everyonePack] }] : []),
    ...cash,
  ];
  // Same deadline and rules as the gameweek's other matches.
  const ref = gw.competitions[0];
  // With fixtures picked, squads lock 10 minutes before the first of them kicks off (so a midweek
  // match can still be entered after the weekend games have started).
  const firstKick = picked.length ? Math.min(...picked.map((f) => f.kickoffAt.getTime())) : null;
  const locksAt = firstKick ? new Date(firstKick - 10 * 60_000) : (ref?.locksAt ?? new Date(gw.startsAt.getTime() - 10 * 60_000));
  if (locksAt <= new Date()) throw new DomainError("LOCKED", "Those fixtures have already kicked off (or are about to).");
  const opensAt = ref?.entryOpensAt ?? new Date();
  const key = ref?.code.split("-").slice(0, -1).join("-") || `gw-${gw.season}-${gw.number}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "match";
  return withTx(async (tx) => {
    const c = await tx.competition.create({
      data: {
        sportId: gw.sportId,
        gameweekId: gw.id,
        code: `${key}-${slug}-${Date.now().toString(36)}`,
        name: `${name} · GW${gw.number}`,
        format: m.tier ? (`${m.tier}_ONLY` as "BRONZE_ONLY" | "SILVER_ONLY" | "GOLD_ONLY") : "OPEN",
        rosterRules: ref?.rosterRules ?? "football-roster-v3",
        scoringRules: ref?.scoringRules ?? "football-scoring-v2-draft",
        rewards: rewards as never,
        requirements: requirements as never,
        entryFeeMinor: m.entryFeeMinor,
        entryOpensAt: opensAt,
        locksAt,
        status: opensAt <= new Date() ? "OPEN" : "UPCOMING",
      },
    });
    await audit(tx, { actorId: adminId, action: "competition.create", entityType: "Competition", entityId: c.id, after: { name: c.name, requirements, rewards, fee: m.entryFeeMinor } });
    return c;
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
    include: { user: { select: { displayName: true, foundingNumber: true, clubName: true, crest: true } } },
    orderBy: settled ? [{ rank: "asc" }] : [{ provisionalPoints: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    take: limit,
  });
  const prizes = settled ? await prizesPaid(competitionId) : new Map<string, number>();
  let rank = 0;
  return entries.map((e, i) => {
    const pts = settled ? e.finalPoints : e.provisionalPoints;
    if (!settled && (i === 0 || pts !== (settled ? entries[i - 1].finalPoints : entries[i - 1].provisionalPoints))) rank = i + 1;
    return {
      entryId: e.id,
      userId: e.userId,
      displayName: e.user.displayName,
      foundingNumber: e.user.foundingNumber,
      clubName: e.user.clubName,
      crest: toCrest(e.user.crest),
      points: pts ?? 0,
      rank: settled ? e.rank ?? i + 1 : rank,
      final: settled,
      prizeMinor: prizes.get(e.userId) ?? 0,
    };
  });
}

/** £ actually paid out per manager for a settled match. */
export async function prizesPaid(competitionId: string) {
  const rows = await db.walletEntry.findMany({ where: { kind: "PRIZE", refId: { startsWith: `prize:${competitionId}:` } }, select: { userId: true, amountMinor: true } });
  return new Map(rows.map((r) => [r.userId, r.amountMinor]));
}

/** Top three for each settled match (ties included), with prizes. */
export async function podiums(competitionIds: string[]) {
  const out = new Map<string, Array<{ rank: number; displayName: string; foundingNumber: number | null; points: number; prizeMinor: number }>>();
  for (const id of competitionIds) {
    const [entries, prizes] = await Promise.all([
      db.competitionEntry.findMany({ where: { competitionId: id, status: "ACTIVE", rank: { lte: 3 } }, orderBy: [{ rank: "asc" }, { createdAt: "asc" }], take: 6, include: { user: { select: { displayName: true, foundingNumber: true } } } }),
      prizesPaid(id),
    ]);
    out.set(id, entries.map((e) => ({ rank: e.rank ?? 0, displayName: e.user.displayName, foundingNumber: e.user.foundingNumber, points: e.finalPoints ?? 0, prizeMinor: prizes.get(e.userId) ?? 0 })));
  }
  return out;
}

/**
 * Admin: remove a match that hasn't locked. Everyone who entered gets their entry fee back, their
 * cards and booster are released and they're told. Matches that have started can't be removed.
 */
export async function removeCompetition(adminId: string, competitionId: string) {
  const removed = await withTx(async (tx) => {
    const comp = await tx.competition.findUnique({ where: { id: competitionId } });
    if (!comp) throw new DomainError("NOT_FOUND", "Match not found.");
    if (!["UPCOMING", "OPEN"].includes(comp.status) || comp.locksAt <= new Date()) throw new DomainError("LOCKED", "This match has locked or started, so it can't be removed.");
    const entries = await tx.competitionEntry.findMany({ where: { competitionId } });
    for (const e of entries) {
      if (comp.entryFeeMinor > 0) {
        await lockWallet(tx, e.userId);
        await release(tx, { userId: e.userId, refId: `entry:${e.id}`, kind: "ENTRY_REFUND", note: `${comp.name} — match removed, entry refunded` });
      }
      await tx.cardInstance.updateMany({ where: { lock: "COMPETITION", lockRef: e.id }, data: { lock: "NONE", lockRef: null } });
      await tx.competitionSelection.deleteMany({ where: { entryId: e.id } });
      await releaseBooster(tx, e.id);
      await tx.competitionEntry.delete({ where: { id: e.id } });
    }
    await tx.competition.delete({ where: { id: competitionId } });
    await audit(tx, { actorId: adminId, action: "competition.remove", entityType: "Competition", entityId: competitionId, after: { name: comp.name, entries: entries.length } });
    return { name: comp.name, users: entries.map((e) => e.userId) };
  });
  const { notify } = await import("./notifications");
  for (const u of removed.users) {
    await notify(u, { kind: "MATCH", title: `${removed.name} was removed`, body: "Your entry has been cancelled, any entry fee refunded and your players are free again.", href: "/matches", dedupeKey: `match-removed:${competitionId}:${u}` }).catch(() => {});
  }
  return removed.users.length;
}
