import { blockIfPaused } from "../safer-play";
import { createHash, randomBytes } from "node:crypto";
import { ClubNameSchema, suggestedCrests } from "@/lib/crest";
import { z } from "zod";
import { db, withTx } from "../db";
import { DomainError, isUniqueViolation } from "../errors";
import { isEnabled } from "../flags";
import { grantStarterLoans, grantStarterPack } from "../packs";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
  displayName: z
    .string()
    .trim()
    .min(3, "Manager name must be 3–24 characters")
    .max(24, "Manager name must be 3–24 characters")
    .regex(/^[A-Za-z0-9_ .-]+$/, "Letters, numbers, spaces, . _ - only"),
  /** Manager name of whoever invited them (refer a friend). */
  ref: z.string().trim().max(24).optional(),
  /** Name of the manager's own club (they design its crest straight after signing up). */
  clubName: ClubNameSchema.optional(),
  /** Club code of the team they support, or "none". */
  favouriteClub: z.string().trim().max(10).optional(),
});

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// A well-formed dummy hash, so unknown emails still cost one scrypt comparison.
const DUMMY_HASH = ["scrypt", 16384, 8, 1, "AAAAAAAAAAAAAAAAAAAAAA==", Buffer.alloc(64).toString("base64")].join("$");

/**
 * Register a MATCHX account (one account for every world) and grant the free football
 * Starter Pack in the same transaction (spec §5.2, §18).
 */
export async function registerUser(input: z.input<typeof RegisterSchema>) {
  const data = RegisterSchema.parse(input);
  const passwordHash = await hashPassword(data.password);
  const emailVerificationToken = randomBytes(24).toString("base64url");
  const founding = await isEnabled("FOUNDING_SIGNUPS");
  const favourite = data.favouriteClub && data.favouriteClub !== "none" ? await db.club.findUnique({ where: { code: data.favouriteClub }, select: { id: true } }) : null;
  const referrer = data.ref ? await db.user.findFirst({ where: { displayName: { equals: data.ref, mode: "insensitive" }, status: "ACTIVE" }, select: { id: true } }) : null;
  try {
    return await withTx(async (tx) => {
      // Founding members get the next number; an advisory lock stops two sign-ups taking the same one.
      let foundingNumber: number | null = null;
      if (founding) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242)`;
        const top = await tx.user.aggregate({ _max: { foundingNumber: true } });
        foundingNumber = (top._max.foundingNumber ?? 0) + 1;
      }
      const user = await tx.user.create({
        data: {
          email: data.email,
          displayName: data.displayName,
          passwordHash,
          emailVerificationToken,
          role: adminEmails().includes(data.email) ? "ADMIN" : "USER",
          foundingNumber,
          referredById: referrer?.id,
          favouriteClubId: favourite?.id,
          // A starting crest from the club name, so every club has one even before it's customised.
          clubName: data.clubName,
          crest: data.clubName ? suggestedCrests(data.clubName)[0] : undefined,
        },
      });
      const starter = await grantStarterPack(tx, user.id);
      await grantStarterLoans(tx, user.id);
      return { user, starterEntitlementId: starter.id, emailVerificationToken };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("ACCOUNT_EXISTS", "That email or manager name is already registered.");
    throw e;
  }
}

export async function authenticate(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new DomainError("BAD_CREDENTIALS", "Email or password is incorrect.");
  if (user.status === "SUSPENDED") throw new DomainError("SUSPENDED", "This account is suspended. Contact support.");
  blockIfPaused(user);
  return user;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string, ipHash: string | null = null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { id: hashToken(token), userId, expiresAt, ipHash } });
  return { token, expiresAt };
}

export async function userForSessionToken(token: string) {
  const session = await db.session.findUnique({ where: { id: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") return null;
  const now = new Date();
  if ((session.user.timeOutUntil && session.user.timeOutUntil > now) || (session.user.selfExcludedUntil && session.user.selfExcludedUntil > now)) return null;
  return session.user;
}

export async function destroySession(token: string) {
  await db.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function verifyEmail(token: string) {
  const user = await db.user.findUnique({ where: { emailVerificationToken: token } });
  if (!user) throw new DomainError("BAD_TOKEN", "This verification link is invalid or has already been used.");
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), emailVerificationToken: null } });
  return user;
}
