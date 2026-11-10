import { WELCOME_SCHEDULE } from "@/config/packs";
import { db, withTx } from "./db";
import { grantPack } from "./packs";

const DAY = 86_400_000;

/**
 * Welcome gifts after the Starter Pack (see WELCOME_SCHEDULE). Granted lazily when the manager
 * next visits once a gift is due, and by the scheduled job for everyone else. Idempotent per
 * manager per gift via the entitlement's unique sourceRef (`welcome:<code>:<userId>`).
 */
export function welcomeTimeline(createdAt: Date) {
  return WELCOME_SCHEDULE.map((w) => ({ ...w, at: new Date(createdAt.getTime() + w.afterDays * DAY) }));
}

export async function grantDueWelcomePacks(userId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true, status: true } });
  if (!user || user.status !== "ACTIVE") return 0;
  const due = welcomeTimeline(user.createdAt).filter((w) => w.at <= now);
  if (!due.length) return 0;
  const refs = due.map((w) => `welcome:${w.code}:${userId}`);
  const have = await db.packEntitlement.findMany({ where: { sourceRef: { in: refs } }, select: { sourceRef: true } });
  const missing = due.filter((w) => !have.some((h) => h.sourceRef === `welcome:${w.code}:${userId}`));
  for (const w of missing) {
    await withTx((tx) => grantPack(tx, { userId, skuCode: w.code, source: "REWARD", sourceRef: `welcome:${w.code}:${userId}` }));
  }
  return missing.length;
}

/** Upcoming gifts for the Packs page teaser. */
export async function upcomingWelcomePacks(userId: string, now = new Date()) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } });
  return welcomeTimeline(user.createdAt).filter((w) => w.at > now);
}

/** Scheduled job: grant due gifts to everyone who joined in the last few weeks. */
export async function grantAllDueWelcomePacks(now = new Date()) {
  const longest = Math.max(...WELCOME_SCHEDULE.map((w) => w.afterDays));
  const users = await db.user.findMany({ where: { status: "ACTIVE", createdAt: { gte: new Date(now.getTime() - (longest + 30) * DAY) } }, select: { id: true } });
  let granted = 0;
  for (const u of users) granted += await grantDueWelcomePacks(u.id, now);
  return granted;
}
