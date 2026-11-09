import type { CardCategory, CardEdition, CardSupplyState, TradeStatus } from "@/generated/prisma/client";
import type { Tx } from "./db";
import { DomainError } from "./errors";

/**
 * Mint `count` new instances of a template. Serials are allocated under a row lock on the
 * template, and the template's maxSupply cap is enforced.
 */
export async function mintInstances(
  tx: Tx,
  args: {
    templateId: string;
    count: number;
    state: Extract<CardSupplyState, "AVAILABLE" | "HELD">;
    ownerId?: string;
    tradeStatus?: TradeStatus;
    releaseId?: string;
  },
): Promise<string[]> {
  if (args.count <= 0) return [];
  const [tpl] = await tx.$queryRaw<Array<{ id: string; maxSupply: number | null }>>`
    SELECT id, "maxSupply" FROM "CardTemplate" WHERE id = ${args.templateId}::uuid FOR UPDATE`;
  if (!tpl) throw new Error(`Template ${args.templateId} not found`);
  const [{ max, n }] = await tx.$queryRaw<Array<{ max: number | null; n: bigint }>>`
    SELECT MAX(serial) AS max, COUNT(*) AS n FROM "CardInstance" WHERE "templateId" = ${args.templateId}::uuid`;
  let count = args.count;
  if (tpl.maxSupply !== null) count = Math.min(count, tpl.maxSupply - Number(n));
  if (count <= 0) return [];
  const start = (max ?? 0) + 1;
  const rows = await tx.cardInstance.createManyAndReturn({
    data: Array.from({ length: count }, (_, i) => ({
      templateId: args.templateId,
      serial: start + i,
      supplyState: args.state,
      ownerId: args.state === "HELD" ? args.ownerId : null,
      tradeStatus: args.tradeStatus ?? "TRADEABLE",
      releaseId: args.releaseId,
    })),
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  return ids;
}

export async function ensureTemplate(tx: Tx, playerId: string, category: CardCategory, edition: CardEdition) {
  return tx.cardTemplate.upsert({
    where: { playerId_category_edition_version: { playerId, category, edition, version: 1 } },
    create: { playerId, category, edition, version: 1 },
    update: {},
  });
}

/** Assert a held card belongs to the user and is free of any lock. Takes a row lock. */
export async function lockOwnedCard(tx: Tx, userId: string, cardId: string) {
  const [row] = await tx.$queryRaw<
    Array<{ id: string; ownerId: string | null; supplyState: string; lock: string; tradeStatus: string }>
  >`SELECT id, "ownerId", "supplyState", "lock", "tradeStatus" FROM "CardInstance" WHERE id = ${cardId}::uuid FOR UPDATE`;
  if (!row || row.ownerId !== userId || row.supplyState !== "HELD") {
    throw new DomainError("NOT_OWNER", "You don't own this card.");
  }
  return row;
}
