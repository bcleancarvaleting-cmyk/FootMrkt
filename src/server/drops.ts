import { z } from "zod";
import { FOOTBALL_PACKS, WEEKLY_PACK_CODE } from "@/config/packs";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { grantPack } from "./packs";

/**
 * Free pack drops (product request 10 Nov 2026). Admins choose the days; each drop is open for a
 * window (24 hours by default) and every manager can claim it once. Claims are idempotent via
 * the entitlement's unique sourceRef, so double taps never grant two packs.
 */
export const DropSchema = z.object({
  title: z.string().trim().min(3).max(60),
  skuCode: z.string().default(WEEKLY_PACK_CODE),
  startsAt: z.coerce.date(),
  hours: z.number().int().min(1).max(72).default(24),
});

export async function activeDrop(now = new Date()) {
  return db.freePackDrop.findFirst({ where: { startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { startsAt: "desc" } });
}

export async function dropStatus(userId: string, now = new Date()) {
  const drop = await activeDrop(now);
  if (!drop) return null;
  const ent = await db.packEntitlement.findUnique({ where: { sourceRef: `drop:${drop.id}:${userId}` } });
  return { drop, claimed: !!ent, entitlementId: ent?.id ?? null, opened: ent?.status === "OPENED" };
}

export async function claimDrop(userId: string, dropId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") throw new DomainError("NOT_ALLOWED", "This account can't claim packs right now.");
  const drop = await db.freePackDrop.findUnique({ where: { id: dropId } });
  if (!drop || drop.startsAt > now || drop.endsAt <= now) throw new DomainError("CLOSED", "This free pack has ended.");
  return withTx((tx) => grantPack(tx, { userId, skuCode: drop.skuCode, source: "WEEKLY", sourceRef: `drop:${drop.id}:${userId}` }));
}

export async function scheduleDrop(adminId: string, input: z.input<typeof DropSchema>) {
  const d = DropSchema.parse(input);
  const sku = FOOTBALL_PACKS.find((p) => p.code === d.skuCode);
  if (!sku || sku.kind !== "WEEKLY") throw new DomainError("BAD_PACK", "Free drops must use an untradeable free pack.");
  const endsAt = new Date(d.startsAt.getTime() + d.hours * 3_600_000);
  const clash = await db.freePackDrop.findFirst({ where: { startsAt: { lt: endsAt }, endsAt: { gt: d.startsAt } } });
  if (clash) throw new DomainError("CLASH", `That overlaps “${clash.title}”.`);
  return withTx(async (tx) => {
    const drop = await tx.freePackDrop.create({ data: { title: d.title, skuCode: d.skuCode, startsAt: d.startsAt, endsAt, createdById: adminId } });
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
