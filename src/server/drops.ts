import { z } from "zod";
import { FOOTBALL_PACKS, WEEKLY_PACK_CODE } from "@/config/packs";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { grantPack } from "./packs";
import { credit, creditXp } from "./wallet";

/**
 * Gifts (admin "Gifts & free packs"): for a window (24 hours by default) every manager who logs in
 * can claim the gift once — any free pack (e.g. Choice of Gold, Gift: Gold Pack), or a credit of
 * XP or earned credit. Claims are idempotent: packs via the entitlement's unique sourceRef, credits via
 * the wallet entry's unique refId (both `drop:<id>:<userId>`), so double taps never grant twice.
 */
export const DropSchema = z
  .object({
    title: z.string().trim().min(3).max(60),
    giftType: z.enum(["PACK", "XP", "MX"]).default("PACK"),
    skuCode: z.string().optional(),
    /** XP points, or MX hundredths. */
    amount: z.number().int().positive().max(1_000_000).optional(),
    startsAt: z.coerce.date(),
    hours: z.number().int().min(1).max(72).default(24),
  })
  .transform((d) => ({ ...d, skuCode: d.giftType === "PACK" ? d.skuCode ?? WEEKLY_PACK_CODE : undefined }));

type Gift = { giftType: string; skuCode: string | null; amount: number | null };

/** "Choice of Gold", "250 XP", "5.00 MX"… */
export function giftLabel(g: Gift) {
  if (g.giftType === "XP") return `${(g.amount ?? 0).toLocaleString("en-GB")} XP`;
  if (g.giftType === "MX") return `£${((g.amount ?? 0) / 100).toFixed(2)}`;
  return FOOTBALL_PACKS.find((p) => p.code === g.skuCode)?.name ?? "Free pack";
}

export async function activeDrop(now = new Date()) {
  return db.freePackDrop.findFirst({ where: { startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { startsAt: "desc" } });
}

export async function dropStatus(userId: string, now = new Date()) {
  const drop = await activeDrop(now);
  if (!drop) return null;
  const ref = `drop:${drop.id}:${userId}`;
  if (drop.giftType !== "PACK") {
    const got = await db.walletEntry.findUnique({ where: { refId: ref } });
    return { drop, label: giftLabel(drop), claimed: !!got, entitlementId: null, opened: !!got };
  }
  const ent = await db.packEntitlement.findUnique({ where: { sourceRef: ref } });
  return { drop, label: giftLabel(drop), claimed: !!ent, entitlementId: ent?.id ?? null, opened: ent?.status === "OPENED" };
}

export async function claimDrop(userId: string, dropId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") throw new DomainError("NOT_ALLOWED", "This account can't claim gifts right now.");
  const drop = await db.freePackDrop.findUnique({ where: { id: dropId } });
  if (!drop || drop.startsAt > now || drop.endsAt <= now) throw new DomainError("CLOSED", "This gift has ended.");
  const ref = `drop:${drop.id}:${userId}`;
  if (drop.giftType === "XP") {
    await withTx((tx) => creditXp(tx, { userId, xp: drop.amount ?? 0, refId: ref, note: drop.title }));
    return { kind: "XP" as const, label: giftLabel(drop) };
  }
  if (drop.giftType === "MX") {
    await withTx((tx) => credit(tx, { userId, amountMinor: drop.amount ?? 0, kind: "ADMIN_ADJUSTMENT", bucket: "BONUS", refId: ref, note: drop.title }));
    return { kind: "MX" as const, label: giftLabel(drop) };
  }
  const entitlement = await withTx((tx) => grantPack(tx, { userId, skuCode: drop.skuCode!, source: "WEEKLY", sourceRef: ref }));
  return { kind: "PACK" as const, label: giftLabel(drop), entitlement, skuCode: drop.skuCode! };
}

export async function scheduleDrop(adminId: string, input: z.input<typeof DropSchema>) {
  const d = DropSchema.parse(input);
  if (d.giftType === "PACK") {
    const sku = FOOTBALL_PACKS.find((p) => p.code === d.skuCode);
    if (!sku || sku.kind !== "WEEKLY") throw new DomainError("BAD_PACK", "Gift packs must be free, untradeable packs.");
  } else if (!d.amount) {
    throw new DomainError("AMOUNT", `Enter how much ${d.giftType} to give.`);
  }
  const endsAt = new Date(d.startsAt.getTime() + d.hours * 3_600_000);
  const clash = await db.freePackDrop.findFirst({ where: { startsAt: { lt: endsAt }, endsAt: { gt: d.startsAt } } });
  if (clash) throw new DomainError("CLASH", `That overlaps “${clash.title}”.`);
  return withTx(async (tx) => {
    const drop = await tx.freePackDrop.create({
      data: { title: d.title, giftType: d.giftType, skuCode: d.skuCode ?? null, amount: d.giftType === "PACK" ? null : d.amount, startsAt: d.startsAt, endsAt, createdById: adminId },
    });
    await audit(tx, { actorId: adminId, action: "drop.schedule", entityType: "FreePackDrop", entityId: drop.id, after: drop });
    return drop;
  });
}

export async function cancelDrop(adminId: string, dropId: string) {
  return withTx(async (tx) => {
    const drop = await tx.freePackDrop.findUnique({ where: { id: dropId } });
    if (!drop) throw new DomainError("NOT_FOUND", "Drop not found.");
    if (drop.startsAt <= new Date()) {
      // Already live: end it now rather than deleting, so existing claims keep their history.
      await tx.freePackDrop.update({ where: { id: dropId }, data: { endsAt: new Date(Math.max(Date.now(), drop.startsAt.getTime() + 1000)) } });
    } else {
      await tx.freePackDrop.delete({ where: { id: dropId } });
    }
    await audit(tx, { actorId: adminId, action: "drop.cancel", entityType: "FreePackDrop", entityId: dropId, before: drop });
  });
}

export async function upcomingDrops(now = new Date()) {
  return db.freePackDrop.findMany({ where: { endsAt: { gt: now } }, orderBy: { startsAt: "asc" }, take: 20 });
}
