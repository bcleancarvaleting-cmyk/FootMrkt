import { FOOTBALL_PACKS, WELCOME_SCHEDULE } from "@/config/packs";
import { z } from "zod";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { grantPack } from "./packs";

const DAY = 86_400_000;

/**
 * Welcome gifts after the Starter Pack, set in Admin → Economy (defaults: Welcome Silver on day 3,
 * Lucky Gold on day 7). Granted when the manager next visits once due, and by the scheduled job.
 * Idempotent per manager per gift via the entitlement's unique sourceRef (`welcome:<giftId>:<userId>`).
 * Only free, untradeable packs can be gifts.
 */
export async function ensureDefaultWelcomeGifts() {
  if (await db.welcomeGift.count()) return;
  await db.welcomeGift.createMany({ data: WELCOME_SCHEDULE.map((w) => ({ skuCode: w.code, afterDays: w.afterDays })) });
}

export const giftPacks = () => FOOTBALL_PACKS.filter((p) => p.kind === "WEEKLY").map((p) => ({ code: p.code, name: p.name }));

async function activeGifts() {
  await ensureDefaultWelcomeGifts();
  return db.welcomeGift.findMany({ where: { active: true }, orderBy: { afterDays: "asc" } });
}

export async function grantDueWelcomePacks(userId: string, now = new Date()) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true, status: true } });
  if (!user || user.status !== "ACTIVE") return 0;
  const due = (await activeGifts()).filter((g) => user.createdAt.getTime() + g.afterDays * DAY <= now.getTime());
  if (!due.length) return 0;
  const ref = (id: string) => `welcome:${id}:${userId}`;
  const have = await db.packEntitlement.findMany({ where: { sourceRef: { in: due.map((g) => ref(g.id)) } }, select: { sourceRef: true } });
  const missing = due.filter((g) => !have.some((h) => h.sourceRef === ref(g.id)));
  for (const g of missing) {
    await withTx((tx) => grantPack(tx, { userId, skuCode: g.skuCode, source: "REWARD", sourceRef: ref(g.id) }));
    const { emailUser } = await import("./email/send");
    const pack = FOOTBALL_PACKS.find((p) => p.code === g.skuCode)?.name ?? "free pack";
    await emailUser(userId, "packReady", { pack }, `packready:${ref(g.id)}`);
    await (await import("./alerts")).alerts.packReady(userId, `Welcome gift: ${pack}`, ref(g.id));
  }
  return missing.length;
}

/** Upcoming gifts for the Packs page teaser. */
export async function upcomingWelcomePacks(userId: string, now = new Date()) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } });
  return (await activeGifts())
    .map((g) => ({ id: g.id, code: g.skuCode, at: new Date(user.createdAt.getTime() + g.afterDays * DAY) }))
    .filter((g) => g.at > now);
}

/** Scheduled job: grant due gifts to recent sign-ups. */
export async function grantAllDueWelcomePacks(now = new Date()) {
  const gifts = await activeGifts();
  if (!gifts.length) return 0;
  const longest = Math.max(...gifts.map((g) => g.afterDays));
  const users = await db.user.findMany({ where: { status: "ACTIVE", createdAt: { gte: new Date(now.getTime() - (longest + 30) * DAY) } }, select: { id: true } });
  let granted = 0;
  for (const u of users) granted += await grantDueWelcomePacks(u.id, now);
  return granted;
}

const GiftSchema = z.object({ skuCode: z.string(), afterDays: z.number().int().min(0).max(365) });

export async function addWelcomeGift(adminId: string, input: z.input<typeof GiftSchema>) {
  const d = GiftSchema.parse(input);
  if (!giftPacks().some((p) => p.code === d.skuCode)) throw new DomainError("BAD_PACK", "Welcome gifts must be free, untradeable packs.");
  await ensureDefaultWelcomeGifts();
  const g = await db.welcomeGift.create({ data: d });
  await audit(db, { actorId: adminId, action: "welcome.add", entityType: "WelcomeGift", entityId: g.id, after: g });
  return g;
}

export async function updateWelcomeGift(adminId: string, id: string, patch: { afterDays?: number; active?: boolean }) {
  if (patch.afterDays !== undefined) GiftSchema.shape.afterDays.parse(patch.afterDays);
  const before = await db.welcomeGift.findUniqueOrThrow({ where: { id } });
  const g = await db.welcomeGift.update({ where: { id }, data: patch });
  await audit(db, { actorId: adminId, action: "welcome.update", entityType: "WelcomeGift", entityId: id, before, after: g });
  return g;
}

export async function welcomeGiftsForAdmin() {
  await ensureDefaultWelcomeGifts();
  const gifts = await db.welcomeGift.findMany({ orderBy: { afterDays: "asc" } });
  const counts = await Promise.all(gifts.map((g) => db.packEntitlement.count({ where: { sourceRef: { startsWith: `welcome:${g.id}:` } } })));
  return gifts.map((g, i) => ({ ...g, name: FOOTBALL_PACKS.find((p) => p.code === g.skuCode)?.name ?? g.skuCode, given: counts[i] }));
}
