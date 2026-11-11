import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "./audit";
import { hashToken } from "./auth/accounts";
import { db, withTx } from "./db";
import { APP_URL } from "./email/templates";
import { sendEmail } from "./email/send";
import { DomainError } from "./errors";

/**
 * Admin tools for one manager's account (product decision 11 Nov 2026): block for cheating (and
 * unblock), send or copy a password-reset link, confirm their email by hand, turn off two-step
 * login if they've lost their phone, and sign them out everywhere. Every action is audited.
 * Admins can't use these on themselves or on another admin.
 */
const RESET_TTL_MS = 24 * 60 * 60_000;

async function target(adminId: string, userId: string) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) throw new DomainError("NOT_FOUND", "No such manager.");
  if (u.id === adminId) throw new DomainError("SELF", "You can't do this to your own account.");
  if (u.role === "ADMIN") throw new DomainError("ADMIN", "Admins can't be changed from here.");
  return u;
}

export const BlockSchema = z.object({ reason: z.string().trim().min(3, "Give a reason (it's kept in the audit log)").max(300) });

/**
 * Block: the account is suspended, signed out everywhere, can't log in or trade, and its open
 * Transfer list listings are taken down (cards unlocked, waiting offers refunded). Cards, MX and
 * entries are kept so the account can be restored exactly as it was.
 */
export async function blockUser(adminId: string, userId: string, input: z.input<typeof BlockSchema>) {
  const { reason } = BlockSchema.parse(input);
  const u = await target(adminId, userId);
  if (u.status === "SUSPENDED") throw new DomainError("ALREADY", `${u.displayName} is already blocked.`);
  const listings = await db.marketListing.findMany({ where: { sellerId: userId, status: "ACTIVE" }, select: { id: true } });
  const { withdrawListingForAdmin } = await import("./transfers");
  for (const l of listings) await withdrawListingForAdmin(adminId, l.id, "Seller blocked");
  await withTx(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
    await tx.session.deleteMany({ where: { userId } });
    await audit(tx, { actorId: adminId, action: "user.block", entityType: "User", entityId: userId, after: { reason, listingsWithdrawn: listings.length } });
  });
  return { listings: listings.length };
}

export async function unblockUser(adminId: string, userId: string) {
  const u = await target(adminId, userId);
  if (u.status !== "SUSPENDED") throw new DomainError("NOT_BLOCKED", `${u.displayName} isn't blocked.`);
  await withTx(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
    await audit(tx, { actorId: adminId, action: "user.unblock", entityType: "User", entityId: userId });
  });
}

/** A one-use reset link valid for 24 hours, emailed to them; also returned so you can send it yourself. */
export async function adminPasswordReset(adminId: string, userId: string) {
  const u = await target(adminId, userId);
  const token = randomBytes(32).toString("base64url");
  const url = `${APP_URL}/reset-password?token=${token}`;
  await withTx(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordResetHash: hashToken(token), passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS) } });
    await audit(tx, { actorId: adminId, action: "user.password_reset", entityType: "User", entityId: userId });
  });
  await sendEmail("passwordReset", { userId: u.id, email: u.email }, { name: u.displayName, url }).catch(() => {});
  return url;
}

export async function adminVerifyEmail(adminId: string, userId: string) {
  const u = await target(adminId, userId);
  if (u.emailVerifiedAt) throw new DomainError("ALREADY", "Their email is already confirmed.");
  await withTx(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date(), emailVerificationToken: null } });
    await audit(tx, { actorId: adminId, action: "user.verify_email", entityType: "User", entityId: userId });
  });
}

export async function adminDisableTwoStep(adminId: string, userId: string) {
  const u = await target(adminId, userId);
  if (!u.totpEnabledAt) throw new DomainError("NOT_ON", "Two-step login isn't on for this account.");
  await withTx(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, backupCodeHashes: [] } });
    await tx.session.deleteMany({ where: { userId } });
    await audit(tx, { actorId: adminId, action: "user.disable_2fa", entityType: "User", entityId: userId });
  });
}

export async function adminSignOutEverywhere(adminId: string, userId: string) {
  await target(adminId, userId);
  return withTx(async (tx) => {
    const r = await tx.session.deleteMany({ where: { userId } });
    await audit(tx, { actorId: adminId, action: "user.sign_out", entityType: "User", entityId: userId, after: { sessions: r.count } });
    return r.count;
  });
}

/** Everything an admin needs on one manager's page. */
export async function adminUserDetail(userId: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { favouriteClub: { select: { name: true } }, referredBy: { select: { id: true, displayName: true } }, _count: { select: { referrals: true, entries: true, sessions: true } } },
  });
  if (!u) return null;
  const [cards, flags, log] = await Promise.all([
    db.cardInstance.count({ where: { ownerId: userId } }),
    db.tradeFlag.findMany({ where: { OR: [{ sellerId: userId }, { buyerId: userId }] }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.adminAuditLog.findMany({ where: { entityType: "User", entityId: userId }, orderBy: { createdAt: "desc" }, take: 20, include: { actor: { select: { displayName: true } } } }),
  ]);
  const { balancesFor } = await import("./wallet");
  return { user: u, cards, flags, log, balances: await balancesFor(userId) };
}
