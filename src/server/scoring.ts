import type { Prisma } from "@/generated/prisma/client";
import { getRosterRules } from "@/domain/football/rules";
import {
  type AppearanceStatus,
  type PlayerGameweekData,
  type SquadScore,
  getScoringRules,
  scoreSquad,
  toStatLine,
} from "@/domain/football/scoring";
import { audit } from "./audit";
import { type Tx, db, withTx } from "./db";
import { DomainError } from "./errors";
import { grantPack } from "./packs";

const TERMINAL = new Set(["FINISHED", "POSTPONED", "ABANDONED"]);

/**
 * Build per-player gameweek data from the CURRENT stat revisions of the gameweek's fixtures.
 * Appearance: PLAYED if any minutes; DID_NOT_PLAY once all of the club's fixtures are over (or
 * void) with no minutes; otherwise PENDING.
 */
export async function loadGameweekData(tx: Tx | typeof db, gameweekId: string, playerIds: string[]) {
  const fixtures = await tx.fixture.findMany({ where: { gameweekId } });
  const players = await tx.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, clubId: true } });
  const stats = await tx.playerMatchStat.findMany({
    where: { isCurrent: true, playerId: { in: playerIds }, fixtureId: { in: fixtures.map((f) => f.id) } },
    orderBy: { id: "asc" },
  });
  const data = new Map<string, PlayerGameweekData>();
  for (const p of players) {
    const clubFixtures = fixtures.filter((f) => f.homeClubId === p.clubId || f.awayClubId === p.clubId);
    const lines = stats
      .filter((s) => s.playerId === p.id)
      .map((s) => ({ statId: s.id, line: toStatLine(s.stats) }));
    const minutes = lines.reduce((m, l) => m + l.line.minutes, 0);
    let appearance: AppearanceStatus;
    if (minutes > 0) appearance = "PLAYED";
    else if (clubFixtures.every((f) => TERMINAL.has(f.status))) appearance = "DID_NOT_PLAY";
    else appearance = "PENDING";
    data.set(p.id, { appearance, lines });
  }
  return data;
}

export async function scoreEntry(tx: Tx | typeof db, entryId: string): Promise<SquadScore> {
  const entry = await tx.competitionEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { selections: true, competition: true },
  });
  const data = await loadGameweekData(
    tx,
    entry.competition.gameweekId,
    entry.selections.map((s) => s.playerId),
  );
  return scoreSquad(
    getScoringRules(entry.competition.scoringRules),
    getRosterRules(entry.competition.rosterRules),
    entry.selections.map((s) => ({ cardId: s.cardId, playerId: s.playerId, position: s.position, slot: s.slot, order: s.order })),
    data,
  );
}

/** Recalculate provisional scores. Writes a new ScoreCalculation only when inputs changed. */
export async function updateProvisionalScores(competitionId: string) {
  const comp = await db.competition.findUniqueOrThrow({ where: { id: competitionId } });
  if (!["LOCKED", "PROVISIONAL"].includes(comp.status)) {
    throw new DomainError("BAD_STATE", `Competition is ${comp.status}; provisional scoring needs LOCKED or PROVISIONAL.`);
  }
  const entries = await db.competitionEntry.findMany({ where: { competitionId, status: "ACTIVE" }, select: { id: true } });
  let written = 0;
  for (const { id } of entries) {
    await db.$transaction(async (tx) => {
      const score = await scoreEntry(tx, id);
      const last = await tx.scoreCalculation.findFirst({ where: { entryId: id }, orderBy: { createdAt: "desc" } });
      if (last?.inputHash !== score.inputHash) {
        await tx.scoreCalculation.create({ data: calcData(id, "PROVISIONAL", score) });
        written++;
      }
      await tx.competitionEntry.update({ where: { id }, data: { provisionalPoints: score.total } });
    });
  }
  if (comp.status === "LOCKED") await db.competition.update({ where: { id: competitionId }, data: { status: "PROVISIONAL" } });
  return { entries: entries.length, calculationsWritten: written };
}

function calcData(entryId: string, kind: "PROVISIONAL" | "FINAL", s: SquadScore): Prisma.ScoreCalculationUncheckedCreateInput {
  return {
    entryId,
    kind,
    ruleVersion: s.ruleVersion,
    totalPoints: s.total,
    breakdown: {
      rosterRules: s.rosterRules,
      formationUsed: s.formationUsed,
      selections: s.selections,
      substitutions: s.substitutions,
    } as unknown as Prisma.InputJsonValue,
    inputStatIds: s.inputStatIds,
    inputHash: s.inputHash,
  };
}

export interface RewardRule {
  /** Inclusive rank range. */
  rankFrom: number;
  rankTo: number;
  packSkuCode: string;
}

/**
 * Final settlement (spec §6.4): requires every fixture in the gameweek to be terminal, writes
 * FINAL calculations, ranks entries (ties share a rank), releases card locks and grants any
 * configured rewards. Idempotent: settling a SETTLED competition is a no-op.
 */
export async function settleCompetition(competitionId: string, actorId: string | null = null) {
  return withTx(async (tx) => {
    const [comp] = await tx.$queryRaw<Array<{ id: string; status: string; gameweekId: string; rewards: unknown }>>`
      SELECT id, status, "gameweekId", rewards FROM "Competition" WHERE id = ${competitionId}::uuid FOR UPDATE`;
    if (!comp) throw new DomainError("NOT_FOUND", "Competition not found");
    if (comp.status === "SETTLED") return { alreadySettled: true, entries: 0 };
    if (!["LOCKED", "PROVISIONAL"].includes(comp.status)) throw new DomainError("BAD_STATE", `Cannot settle a ${comp.status} competition`);
    const open = await tx.fixture.count({
      where: { gameweekId: comp.gameweekId, status: { notIn: ["FINISHED", "POSTPONED", "ABANDONED"] } },
    });
    if (open > 0) throw new DomainError("FIXTURES_PENDING", `${open} fixture(s) are not finished yet`);

    const entries = await tx.competitionEntry.findMany({ where: { competitionId, status: "ACTIVE" } });
    const totals: Array<{ id: string; userId: string; total: number }> = [];
    for (const e of entries) {
      const score = await scoreEntry(tx, e.id);
      await tx.scoreCalculation.create({ data: calcData(e.id, "FINAL", score) });
      totals.push({ id: e.id, userId: e.userId, total: score.total });
    }
    totals.sort((a, b) => b.total - a.total);
    const rewards = (comp.rewards as RewardRule[]) ?? [];
    let rank = 0;
    for (let i = 0; i < totals.length; i++) {
      if (i === 0 || totals[i].total !== totals[i - 1].total) rank = i + 1;
      const t = totals[i];
      await tx.competitionEntry.update({ where: { id: t.id }, data: { finalPoints: t.total, rank } });
      for (const [ri, r] of rewards.entries()) {
        if (rank >= r.rankFrom && rank <= r.rankTo) {
          await grantPack(tx, { userId: t.userId, skuCode: r.packSkuCode, source: "REWARD", sourceRef: `reward:${competitionId}:${ri}:${t.userId}` });
        }
      }
    }
    // Release competition locks held by this competition's entries.
    await tx.cardInstance.updateMany({
      where: { lock: "COMPETITION", lockRef: { in: entries.map((e) => e.id) } },
      data: { lock: "NONE", lockRef: null },
    });
    await tx.competition.update({ where: { id: competitionId }, data: { status: "SETTLED", settledAt: new Date() } });
    await audit(tx, {
      actorId,
      action: "competition.settle",
      entityType: "Competition",
      entityId: competitionId,
      after: { entries: totals.length, top: totals.slice(0, 3) },
    });
    return { alreadySettled: false, entries: totals.length };
  });
}

/**
 * Reproduce a stored calculation purely from the stat revisions it recorded + its rule version
 * (spec §15, §17). Works even after later corrections, because revisions are never mutated.
 */
export async function reproduceCalculation(calculationId: string) {
  const calc = await db.scoreCalculation.findUniqueOrThrow({
    where: { id: calculationId },
    include: { entry: { include: { selections: true, competition: true } } },
  });
  const breakdown = calc.breakdown as unknown as SquadScore & { rosterRules: string };
  const statIds = calc.inputStatIds as string[];
  const stats = await db.playerMatchStat.findMany({ where: { id: { in: statIds } }, orderBy: { id: "asc" } });
  const data = new Map<string, PlayerGameweekData>();
  for (const sel of breakdown.selections) {
    data.set(sel.playerId, {
      appearance: sel.appearance,
      lines: stats.filter((s) => s.playerId === sel.playerId).map((s) => ({ statId: s.id, line: toStatLine(s.stats) })),
    });
  }
  const recomputed = scoreSquad(
    getScoringRules(calc.ruleVersion),
    getRosterRules(breakdown.rosterRules),
    calc.entry.selections.map((s) => ({ cardId: s.cardId, playerId: s.playerId, position: s.position, slot: s.slot, order: s.order })),
    data,
  );
  return {
    ok: recomputed.total === calc.totalPoints && recomputed.inputHash === calc.inputHash,
    stored: calc.totalPoints,
    recomputed: recomputed.total,
  };
}
