import { Prisma, type CardCategory, type EntitlementSource } from "@/generated/prisma/client";
import { type PlannedSlot, honoursGuarantees, planPack } from "@/domain/packs/compose";
import { type PackConfig, type SlotFilters, parsePackConfig } from "@/domain/packs/config";
import { AuditedRandom, type RandomSource, cryptoRandom } from "@/domain/random";
import { STARTER_PACK_CODE } from "@/config/packs";
import { ensureTemplate, mintInstances } from "./cards";
import { type Tx, db, withTx } from "./db";
import { DomainError } from "./errors";
import { cardsTradeableNow } from "./launch";

/**
 * Server-side pack engine (spec §5.3).
 * - All randomness is server-side via a CSPRNG and every draw is recorded in rngAudit.
 * - Opening consumes a PackEntitlement exactly once (atomic status flip) — a repeated or
 *   concurrent open returns the original result instead of issuing new cards.
 * - Slot floors are never downgraded: if stock for a guaranteed category runs out the whole
 *   opening rolls back and the entitlement stays unopened.
 */

export async function latestSku(code: string, tx: Tx | typeof db = db) {
  const sku = await tx.packSku.findFirst({ where: { code, active: true }, orderBy: { version: "desc" } });
  if (!sku) throw new DomainError("SKU_NOT_FOUND", `Pack ${code} is not available.`);
  return sku;
}

export async function grantPack(
  tx: Tx,
  args: { userId: string; skuCode: string; source: EntitlementSource; sourceRef: string },
) {
  const sku = await latestSku(args.skuCode, tx);
  // Insert-if-absent: the same sourceRef (webhook replay, double reward run) returns the original
  // grant. ON CONFLICT DO NOTHING keeps the surrounding transaction usable.
  await tx.packEntitlement.createMany({
    data: [{ userId: args.userId, packSkuId: sku.id, source: args.source, sourceRef: args.sourceRef }],
    skipDuplicates: true,
  });
  return tx.packEntitlement.findUniqueOrThrow({ where: { sourceRef: args.sourceRef } });
}

export async function grantStarterPack(tx: Tx, userId: string) {
  return grantPack(tx, { userId, skuCode: STARTER_PACK_CODE, source: "STARTER", sourceRef: `starter:${userId}` });
}

interface DrawAudit {
  slotIndex: number;
  label: string;
  rolled: CardCategory;
  floor: CardCategory;
  issued: CardCategory;
  fellBack: boolean;
  poolSize: number;
  pick: number;
  playerId: string;
  cardId: string;
}

export interface OpenPackResult {
  openingId: string;
  alreadyOpened: boolean;
  cards: Array<{ cardId: string; slotIndex: number; category: CardCategory }>;
}

export async function openPack(
  userId: string,
  entitlementId: string,
  rng: RandomSource = cryptoRandom,
): Promise<OpenPackResult> {
  const tradeableNow = await cardsTradeableNow();
  return withTx(async (tx) => {
    // Atomically consume the entitlement. Only one transaction can win this update.
    const consumed = await tx.packEntitlement.updateMany({
      where: { id: entitlementId, userId, status: "UNOPENED" },
      data: { status: "OPENED", openedAt: new Date() },
    });
    if (consumed.count === 0) {
      const existing = await tx.packOpening.findUnique({
        where: { entitlementId },
        include: { cards: { orderBy: { slotIndex: "asc" } } },
      });
      if (existing && existing.userId === userId) {
        return {
          openingId: existing.id,
          alreadyOpened: true,
          cards: existing.cards.map((c) => ({ cardId: c.cardId, slotIndex: c.slotIndex, category: c.category })),
        };
      }
      throw new DomainError("NO_PACK", "That pack isn't available to open.");
    }

    const ent = await tx.packEntitlement.findUniqueOrThrow({ where: { id: entitlementId }, include: { packSku: true } });
    const sku = ent.packSku;
    const cfg = parsePackConfig(sku.config);
    const audited = new AuditedRandom(rng, "plan");
    const plan = planPack(cfg, audited);
    const draws: DrawAudit[] = [];
    const usedPlayers = new Set<string>();
    const nonTradeable = cfg.nonTradeable;

    for (const slot of plan) {
      const drawn =
        cfg.mode === "POOL"
          ? await drawPoolSlot(tx, sku.sportId, slot, cfg, usedPlayers, audited)
          : await drawMintSlot(tx, sku.sportId, userId, slot, cfg, usedPlayers, audited);
      if (!drawn) {
        throw new DomainError(
          "POOL_EXHAUSTED",
          "This pack is temporarily unavailable — please try again later. Your pack has not been used.",
          { slot: slot.label, category: slot.guaranteedCategory },
        );
      }
      usedPlayers.add(drawn.playerId);
      draws.push({ ...drawn, slotIndex: slot.slotIndex, label: slot.label, rolled: slot.category, floor: slot.guaranteedCategory });
    }

    if (!honoursGuarantees(plan, draws.map((d) => d.issued))) {
      // Defensive: should be impossible by construction. Never issue a pack below its guarantee.
      throw new Error("Pack guarantee violated — aborting opening");
    }

    const opening = await tx.packOpening.create({
      data: {
        userId,
        packSkuId: sku.id,
        entitlementId: ent.id,
        pricePaidMinor: ent.source === "PURCHASE" ? sku.priceMinor : 0,
        paymentRef: ent.source === "PURCHASE" ? ent.sourceRef : null,
        configSnapshot: { code: sku.code, version: sku.version, config: cfg } as unknown as Prisma.InputJsonValue,
        rngAudit: { source: rng === cryptoRandom ? "node:crypto" : "injected", draws: audited.draws, slots: draws } as unknown as Prisma.InputJsonValue,
      },
    });

    for (const d of draws) {
      if (cfg.mode === "POOL") {
        const updated = await tx.cardInstance.updateMany({
          where: { id: d.cardId, supplyState: { in: ["AVAILABLE", "RECIRCULATING"] } },
          data: { supplyState: "HELD", ownerId: userId, ...(nonTradeable || !tradeableNow ? { tradeStatus: "NON_TRADEABLE" } : {}) },
        });
        if (updated.count !== 1) throw new Error(`Card ${d.cardId} left the pool mid-opening`);
      }
      await tx.cardOwnership.create({
        data: {
          cardId: d.cardId,
          userId,
          acquiredVia: sku.kind === "STARTER" ? "STARTER_PACK" : sku.kind === "WEEKLY" ? "WEEKLY_PACK" : "PACK",
          acquiredRef: opening.id,
        },
      });
      await tx.packOpeningCard.create({
        data: { packOpeningId: opening.id, cardId: d.cardId, slotIndex: d.slotIndex, category: d.issued },
      });
    }

    return {
      openingId: opening.id,
      alreadyOpened: false,
      cards: draws.map((d) => ({ cardId: d.cardId, slotIndex: d.slotIndex, category: d.issued })),
    };
  });
}

function filterSql(filters: SlotFilters, exclude: Set<string>) {
  const parts: Prisma.Sql[] = [];
  if (filters.topFlightOnly) parts.push(Prisma.sql`AND l."isTopFlight" = true`);
  if (filters.positions?.length) parts.push(Prisma.sql`AND p.position::text = ANY(${filters.positions}::text[])`);
  if (filters.countries?.length) parts.push(Prisma.sql`AND l.country = ANY(${filters.countries}::text[])`);
  if (exclude.size) parts.push(Prisma.sql`AND NOT (p.id = ANY(${[...exclude]}::uuid[]))`);
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

type Drawn = { cardId: string; playerId: string; issued: CardCategory; fellBack: boolean; poolSize: number; pick: number };

async function drawPoolSlot(
  tx: Tx,
  sportId: string,
  slot: PlannedSlot,
  cfg: PackConfig,
  used: Set<string>,
  rng: AuditedRandom,
): Promise<Drawn | null> {
  const attempt = async (category: CardCategory, filters: SlotFilters) => {
    const exclude = cfg.uniquePlayers ? used : new Set<string>();
    const where = Prisma.sql`
      FROM "CardInstance" ci
      JOIN "CardTemplate" t ON t.id = ci."templateId"
      JOIN "Player" p ON p.id = t."playerId"
      LEFT JOIN "Club" c ON c.id = p."clubId"
      LEFT JOIN "League" l ON l.id = c."leagueId"
      WHERE ci."supplyState" IN ('AVAILABLE', 'RECIRCULATING')
        AND t.edition = 'STANDARD' AND t.active AND p.active
        AND p."sportId" = ${sportId}::uuid
        AND t.category::text = ${category}
        ${filterSql(filters, exclude)}`;
    const [{ n }] = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n ${where}`;
    const poolSize = Number(n);
    if (poolSize === 0) return null;
    // Uniform over eligible instances, so scarcer players are proportionally rarer.
    for (let tries = 0; tries < 3; tries++) {
      const pick = rng.withPurpose(`slot${slot.slotIndex}:${category}`).int(poolSize);
      const rows = await tx.$queryRaw<Array<{ id: string; playerId: string }>>`
        SELECT ci.id, p.id AS "playerId" ${where}
        ORDER BY ci.id OFFSET ${pick} LIMIT 1 FOR UPDATE OF ci SKIP LOCKED`;
      if (rows[0]) return { cardId: rows[0].id, playerId: rows[0].playerId, issued: category, poolSize, pick };
    }
    // Heavy contention: take the first unlocked eligible card.
    const rows = await tx.$queryRaw<Array<{ id: string; playerId: string }>>`
      SELECT ci.id, p.id AS "playerId" ${where} ORDER BY ci.id LIMIT 1 FOR UPDATE OF ci SKIP LOCKED`;
    return rows[0] ? { cardId: rows[0].id, playerId: rows[0].playerId, issued: category, poolSize, pick: -1 } : null;
  };

  const primary = await attempt(slot.category, slot.filters);
  if (primary) return { ...primary, fellBack: false };
  if (slot.category !== slot.guaranteedCategory) {
    const floor = await attempt(slot.guaranteedCategory, slot.baseFilters);
    if (floor) return { ...floor, fellBack: true };
  }
  return null;
}

/** Starter packs: pick a random eligible player of the category and mint a STARTER copy. */
async function drawMintSlot(
  tx: Tx,
  sportId: string,
  userId: string,
  slot: PlannedSlot,
  cfg: PackConfig,
  used: Set<string>,
  rng: AuditedRandom,
): Promise<Drawn | null> {
  const attempt = async (category: CardCategory, filters: SlotFilters) => {
    const exclude = cfg.uniquePlayers ? used : new Set<string>();
    // A player is a "Bronze player" / "Silver player" if they have a STANDARD template in that tier.
    const where = Prisma.sql`
      FROM "Player" p
      LEFT JOIN "Club" c ON c.id = p."clubId"
      LEFT JOIN "League" l ON l.id = c."leagueId"
      WHERE p.active AND p."sportId" = ${sportId}::uuid
        AND EXISTS (SELECT 1 FROM "CardTemplate" t WHERE t."playerId" = p.id AND t.edition = 'STANDARD'
                    AND t.active AND t.category::text = ${category})
        ${filterSql(filters, exclude)}`;
    const [{ n }] = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n ${where}`;
    const poolSize = Number(n);
    if (poolSize === 0) return null;
    const pick = rng.withPurpose(`slot${slot.slotIndex}:${category}`).int(poolSize);
    const [row] = await tx.$queryRaw<Array<{ id: string }>>`SELECT p.id ${where} ORDER BY p.id OFFSET ${pick} LIMIT 1`;
    if (!row) return null;
    const tpl = await ensureTemplate(tx, row.id, category, "STARTER");
    const [cardId] = await mintInstances(tx, {
      templateId: tpl.id,
      count: 1,
      state: "HELD",
      ownerId: userId,
      tradeStatus: "NON_TRADEABLE",
    });
    if (!cardId) return null;
    return { cardId, playerId: row.id, issued: category, poolSize, pick };
  };
  const primary = await attempt(slot.category, slot.filters);
  if (primary) return { ...primary, fellBack: false };
  if (slot.category !== slot.guaranteedCategory) {
    const floor = await attempt(slot.guaranteedCategory, slot.baseFilters);
    if (floor) return { ...floor, fellBack: true };
  }
  return null;
}

export async function getOpening(userId: string, openingId: string) {
  const opening = await db.packOpening.findFirst({
    where: { id: openingId, userId },
    include: {
      packSku: true,
      cards: {
        orderBy: { slotIndex: "asc" },
        include: { card: { include: { template: { include: { player: { include: { club: { include: { league: true } } } } } } } } },
      },
    },
  });
  if (!opening) throw new DomainError("NOT_FOUND", "Pack opening not found.");
  return opening;
}

/** Publish any pack SKU versions from the config that aren't in the database yet. */
export async function syncPackCatalogue() {
  const { FOOTBALL_PACKS } = await import("@/config/packs");
  const sport = await db.sport.findUniqueOrThrow({ where: { code: "football" } });
  let added = 0;
  for (const p of FOOTBALL_PACKS) {
    const exists = await db.packSku.findUnique({ where: { code_version: { code: p.code, version: p.version } } });
    if (exists) continue;
    await db.packSku.create({ data: { sportId: sport.id, code: p.code, version: p.version, name: p.name, kind: p.kind, priceMinor: p.priceMinor, config: p.config as never } });
    added++;
  }
  return added;
}
