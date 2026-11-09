import { WEEKLY_PACK_CODE } from "@/config/packs";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { grantPack } from "./packs";
import { weekKey, weekStart } from "@/lib/week";

export { weekKey, weekStart };

/**
 * Weekly free pack: one untradeable pack per manager per week (product decision 9 Nov 2026).
 * Weeks run Monday 00:00 to Monday 00:00, UK time. Claiming is idempotent per week via the
 * entitlement's unique sourceRef, so double clicks or retries never grant two.
 */
export async function weeklyStatus(userId: string, now = new Date()) {
  const ref = `weekly:${userId}:${weekKey(now)}`;
  const ent = await db.packEntitlement.findUnique({ where: { sourceRef: ref } });
  const next = new Date(weekStart(now).getTime() + 7 * 24 * 3600_000 + 2 * 3600_000); // +2h covers a DST change
  return { claimed: !!ent, entitlementId: ent?.id ?? null, opened: ent?.status === "OPENED", nextAt: weekStart(next) };
}

export async function claimWeeklyPack(userId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "ACTIVE") throw new DomainError("NOT_ALLOWED", "This account can't claim packs right now.");
  return withTx((tx) => grantPack(tx, { userId, skuCode: WEEKLY_PACK_CODE, source: "WEEKLY", sourceRef: `weekly:${userId}:${weekKey(now)}` }));
}
