import type { WalletEntryKind } from "@/generated/prisma/client";
import { type Tx, db, withTx } from "./db";
import { DomainError } from "./errors";
import { grantPack, latestSku } from "./packs";

/**
 * Promotional MP credit (product decision 9 Nov 2026: completing a set awards £10 of MP so
 * managers can build better teams). 1 MP ≈ £1; amounts are stored in hundredths of an MP.
 *
 * Credit is an in-game balance only: it can be spent on packs, and is never withdrawable,
 * transferable or redeemable for cash (spec §4.2, §9.3, §11). The ledger is append-only (DB
 * trigger) and every entry carries a unique refId, so retries never double-credit or double-spend.
 */
export const SET_REWARD_MP_MINOR = 1000; // 10.00 MP ≈ £10

export async function balanceMinor(userId: string, tx: Tx | typeof db = db): Promise<number> {
  const r = await tx.walletEntry.aggregate({ where: { userId }, _sum: { amountMinor: true } });
  return r._sum.amountMinor ?? 0;
}

/** Credit inside an existing transaction. Idempotent on refId. */
export async function credit(tx: Tx, args: { userId: string; amountMinor: number; kind: WalletEntryKind; refId: string; note?: string }) {
  if (args.amountMinor <= 0) throw new Error("credit amount must be positive");
  await tx.walletEntry.createMany({ data: [args], skipDuplicates: true });
}

/** Buy a pack with MP credit. Idempotent on clientKey; serialised per user so balance can't go negative. */
export async function buyPackWithCredit(userId: string, skuCode: string, clientKey: string) {
  return withTx(async (tx) => {
    // Serialise spends for this user.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    const refId = `packbuy:${userId}:${clientKey}`;
    const existing = await tx.walletEntry.findUnique({ where: { refId } });
    if (existing) return tx.packEntitlement.findUniqueOrThrow({ where: { sourceRef: `credit:${existing.id}` } });

    const sku = await latestSku(skuCode, tx);
    if (sku.kind !== "REGULAR" || sku.priceMinor <= 0) throw new DomainError("NOT_FOR_SALE", "This pack isn't for sale.");
    const price = sku.priceMinor; // pence == hundredths of an MP at 1 MP ≈ £1
    const balance = await balanceMinor(userId, tx);
    if (balance < price) {
      throw new DomainError("INSUFFICIENT_CREDIT", `Not enough MP credit — this pack costs ${fmtMp(price)} and you have ${fmtMp(balance)}.`);
    }
    const entry = await tx.walletEntry.create({
      data: { userId, kind: "PACK_PURCHASE", amountMinor: -price, refId, note: `${sku.name} v${sku.version}` },
    });
    return grantPack(tx, { userId, skuCode, source: "MP_CREDIT", sourceRef: `credit:${entry.id}` });
  });
}

export function fmtMp(minor: number): string {
  return `${(minor / 100).toFixed(2)} MP`;
}

export async function walletHistory(userId: string, take = 20) {
  return db.walletEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}
