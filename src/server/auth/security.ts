import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "../db";
import { sendEmail } from "../email/send";
import { APP_URL } from "../email/templates";
import { DomainError } from "../errors";
import { hashToken } from "./accounts";
import { hashPassword, verifyPassword } from "./password";
import { hashBackupCode, newBackupCodes, newTotpSecret, otpauthUrl, verifyTotp } from "./totp";

/**
 * Account security: password reset by email, change password, two-step login (authenticator app +
 * backup codes) and signing out of every device.
 */
const PasswordSchema = z.string().min(10, "Password must be at least 10 characters").max(200);
const RESET_TTL_MS = 60 * 60_000;

// ───────────── Password reset ─────────────

/** Always looks the same to the caller, whether or not the email has an account. */
export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.status !== "ACTIVE") return;
  const token = randomBytes(32).toString("base64url");
  await db.user.update({ where: { id: user.id }, data: { passwordResetHash: hashToken(token), passwordResetExpiresAt: new Date(Date.now() + RESET_TTL_MS) } });
  await sendEmail("passwordReset", { userId: user.id, email: user.email }, { name: user.displayName, url: `${APP_URL}/reset-password?token=${token}` });
}

export async function resetPassword(token: string, password: string) {
  const pw = PasswordSchema.parse(password);
  const user = await db.user.findUnique({ where: { passwordResetHash: hashToken(token) } });
  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    throw new DomainError("BAD_TOKEN", "This reset link has expired or already been used. Ask for a new one.");
  }
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(pw), passwordResetHash: null, passwordResetExpiresAt: null } }),
    db.session.deleteMany({ where: { userId: user.id } }),
  ]);
  return user;
}

export async function changePassword(userId: string, current: string, next: string) {
  const pw = PasswordSchema.parse(next);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) throw new DomainError("BAD_CREDENTIALS", "Your current password is wrong.");
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw) } });
}

/** Sign out every device except (optionally) this one. */
export async function signOutEverywhere(userId: string, keepSessionId?: string) {
  const r = await db.session.deleteMany({ where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } });
  return r.count;
}

// ───────────── Two-step login ─────────────

export async function beginTotpSetup(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.totpEnabledAt) throw new DomainError("ALREADY_ON", "Two-step login is already on.");
  const secret = newTotpSecret();
  await db.user.update({ where: { id: userId }, data: { totpSecret: secret } });
  const url = otpauthUrl(secret, user.email);
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } });
  return { secret, url, qrSvg };
}

export async function confirmTotpSetup(userId: string, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpSecret || user.totpEnabledAt) throw new DomainError("NO_SETUP", "Start the set-up again.");
  const step = verifyTotp(user.totpSecret, code);
  if (step === null) throw new DomainError("BAD_CODE", "That code didn't match. Check your phone's clock is right and try the newest code.");
  const { codes, hashes } = newBackupCodes();
  await db.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date(), totpLastStep: step, backupCodeHashes: hashes } });
  return codes;
}

export async function disableTotp(userId: string, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(password, user.passwordHash))) throw new DomainError("BAD_CREDENTIALS", "Your password is wrong.");
  await db.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, backupCodeHashes: [] } });
}

export async function regenerateBackupCodes(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpEnabledAt) throw new DomainError("NOT_ON", "Turn on two-step login first.");
  const { codes, hashes } = newBackupCodes();
  await db.user.update({ where: { id: userId }, data: { backupCodeHashes: hashes } });
  return codes;
}

/** Check the second step at login: an authenticator code (never reused) or a one-time backup code. */
export async function verifySecondFactor(userId: string, input: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpEnabledAt || !user.totpSecret) return true;
  const code = input.trim();
  if (/^\d{3}\s?\d{3}$/.test(code)) {
    const step = verifyTotp(user.totpSecret, code);
    if (step === null || (user.totpLastStep !== null && step <= user.totpLastStep)) return false;
    // Only accept if no other login used this step at the same moment.
    const r = await db.user.updateMany({ where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
    return r.count === 1;
  }
  const h = hashBackupCode(code);
  if (!user.backupCodeHashes.includes(h)) return false;
  await db.user.update({ where: { id: userId }, data: { backupCodeHashes: user.backupCodeHashes.filter((x) => x !== h) } });
  return true;
}

// The half-finished login (password OK, code still needed) lives in a short, signed cookie.
const PENDING_TTL_MS = 10 * 60_000;
const secret = () => process.env.SESSION_SECRET ?? "matchx-dev-session-secret";

export function signPendingLogin(userId: string, now = Date.now()) {
  const payload = `${userId}.${now + PENDING_TTL_MS}`;
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`;
}

export function readPendingLogin(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null;
  const [userId, exp, sig] = value.split(".");
  if (!userId || !exp || !sig) return null;
  const want = createHmac("sha256", secret()).update(`${userId}.${exp}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== want.length || !timingSafeEqual(given, want) || Number(exp) < now) return null;
  return userId;
}
