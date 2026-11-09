import type { CardCategory, Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { audit } from "./audit";
import { mintInstances } from "./cards";
import { db, withTx } from "./db";
import { DomainError } from "./errors";

/**
 * Controlled card supply (spec §7.1). COLLECTR mints new STANDARD inventory into the pack pool on
 * a weekly schedule. Quantities are configurable per category with per-template overrides, and
 * capped by each template's maxSupply. Releases never touch already-issued cards.
 * STATUS: weekly quantities are TO CONFIRM.
 */
export const ReleasePlanSchema = z
  .object({
    perTemplate: z.object({ BRONZE: z.number().int().min(0), SILVER: z.number().int().min(0), GOLD: z.number().int().min(0) }),
    overrides: z.record(z.string().uuid(), z.number().int().min(0)).default({}),
  })
  .strict();
export type ReleasePlan = z.infer<typeof ReleasePlanSchema>;

export const DEFAULT_WEEKLY_PLAN: ReleasePlan = { perTemplate: { BRONZE: 6, SILVER: 3, GOLD: 1 }, overrides: {} };
const WEEK_MS = 7 * 24 * 3600_000;

export async function scheduleRelease(sportId: string, scheduledFor: Date, plan: ReleasePlan, actorId: string | null) {
  const parsed = ReleasePlanSchema.parse(plan);
  return db.$transaction(async (tx) => {
    const r = await tx.supplyRelease.create({ data: { sportId, scheduledFor, plan: parsed as Prisma.InputJsonValue } });
    await audit(tx, { actorId, action: "supply.schedule", entityType: "SupplyRelease", entityId: r.id, after: r });
    return r;
  });
}

export async function updateRelease(
  releaseId: string,
  change: { status?: "SCHEDULED" | "PAUSED" | "CANCELLED"; plan?: ReleasePlan },
  actorId: string,
) {
  return db.$transaction(async (tx) => {
    const before = await tx.supplyRelease.findUniqueOrThrow({ where: { id: releaseId } });
    if (before.status === "EXECUTED") throw new DomainError("BAD_STATE", "An executed release cannot be changed.");
    const after = await tx.supplyRelease.update({
      where: { id: releaseId },
      data: { status: change.status, plan: change.plan ? (ReleasePlanSchema.parse(change.plan) as Prisma.InputJsonValue) : undefined },
    });
    await audit(tx, { actorId, action: "supply.update", entityType: "SupplyRelease", entityId: releaseId, before, after });
    return after;
  });
}

/** Execute one release. Idempotent: an EXECUTED release is never run twice. */
export async function executeRelease(releaseId: string, actorId: string | null) {
  return withTx(async (tx) => {
    const [row] = await tx.$queryRaw<Array<{ id: string; status: string; sportId: string; plan: unknown; scheduledFor: Date }>>`
      SELECT id, status, "sportId", plan, "scheduledFor" FROM "SupplyRelease" WHERE id = ${releaseId}::uuid FOR UPDATE`;
    if (!row) throw new DomainError("NOT_FOUND", "Release not found");
    if (row.status !== "SCHEDULED") return { minted: 0, skipped: row.status };
    const plan = ReleasePlanSchema.parse(row.plan);
    const templates = await tx.cardTemplate.findMany({
      where: { edition: "STANDARD", active: true, player: { sportId: row.sportId, active: true } },
      select: { id: true, category: true },
    });
    let minted = 0;
    const byCategory: Record<CardCategory, number> = { BRONZE: 0, SILVER: 0, GOLD: 0 };
    for (const t of templates) {
      const qty = plan.overrides[t.id] ?? plan.perTemplate[t.category];
      const ids = await mintInstances(tx, { templateId: t.id, count: qty, state: "AVAILABLE", releaseId: row.id });
      minted += ids.length;
      byCategory[t.category] += ids.length;
    }
    await tx.supplyRelease.update({ where: { id: row.id }, data: { status: "EXECUTED", executedAt: new Date(), cardsMinted: minted } });
    // Schedule next week's release with the same plan (admins can pause/adjust it).
    const next = await tx.supplyRelease.findFirst({ where: { sportId: row.sportId, status: { in: ["SCHEDULED", "PAUSED"] }, id: { not: row.id } } });
    if (!next) {
      await tx.supplyRelease.create({
        data: { sportId: row.sportId, scheduledFor: new Date(row.scheduledFor.getTime() + WEEK_MS), plan: plan as Prisma.InputJsonValue },
      });
    }
    await audit(tx, { actorId, action: "supply.execute", entityType: "SupplyRelease", entityId: row.id, after: { minted, byCategory } });
    return { minted, byCategory };
  });
}

export async function executeDueReleases(now = new Date()) {
  const due = await db.supplyRelease.findMany({ where: { status: "SCHEDULED", scheduledFor: { lte: now } }, orderBy: { scheduledFor: "asc" } });
  const results = [];
  for (const r of due) results.push(await executeRelease(r.id, null));
  return results;
}

/**
 * Supply reconciliation (spec §7.1). Every instance is in exactly one supply state by schema;
 * this report also checks that locks/ownership agree and the totals add up.
 */
export async function supplyReport(sportId?: string) {
  const where = sportId ? Prisma_sport(sportId) : {};
  const [byState, byLock, nonTradeable, recycled, total] = await Promise.all([
    db.cardInstance.groupBy({ by: ["supplyState"], _count: { _all: true }, where }),
    db.cardInstance.groupBy({ by: ["lock"], _count: { _all: true }, where: { ...where, supplyState: "HELD" } }),
    db.cardInstance.count({ where: { ...where, tradeStatus: "NON_TRADEABLE" } }),
    db.cardInstance.count({ where: { ...where, recycledCount: { gt: 0 } } }),
    db.cardInstance.count({ where }),
  ]);
  const state = (s: string) => byState.find((b) => b.supplyState === s)?._count._all ?? 0;
  const lock = (l: string) => byLock.find((b) => b.lock === l)?._count._all ?? 0;
  const openOwnerships = await db.cardOwnership.count({ where: { releasedAt: null, ...(sportId ? { card: where } : {}) } });
  const held = state("HELD");
  const problems: string[] = [];
  if (state("AVAILABLE") + state("RECIRCULATING") + held + state("RETIRED") !== total) problems.push("state totals do not add up");
  if (openOwnerships !== held) problems.push(`open ownership records (${openOwnerships}) ≠ held cards (${held})`);
  return {
    totalIssued: total,
    availableInPool: state("AVAILABLE"),
    recirculatingInPool: state("RECIRCULATING"),
    userHeld: held,
    heldUnlocked: lock("NONE"),
    listed: lock("LISTED"),
    lockedInCompetition: lock("COMPETITION"),
    nonTradeable,
    everRecycled: recycled,
    retired: state("RETIRED"),
    reconciled: problems.length === 0,
    problems,
  };
}

function Prisma_sport(sportId: string) {
  return { template: { player: { sportId } } };
}
