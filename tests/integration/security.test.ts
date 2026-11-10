import { beforeEach, describe, expect, it } from "vitest";
import { authenticate } from "@/server/auth/accounts";
import { beginTotpSetup, confirmTotpSetup, readPendingLogin, requestPasswordReset, resetPassword, signPendingLogin, verifySecondFactor } from "@/server/auth/security";
import { hotp, stepAt } from "@/server/auth/totp";
import { db } from "@/server/db";
import { createTicket } from "@/server/support";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("password reset", () => {
  it("emails a one-hour link; using it changes the password, logs out everywhere and can't be reused", async () => {
    const { userId } = await makeUser("forgetful");
    await db.session.create({ data: { id: "old-session", userId, expiresAt: new Date(Date.now() + 1e8) } });
    await requestPasswordReset("FORGETFUL@test.dev ");
    const mail = await db.emailLog.findFirstOrThrow({ where: { userId, template: "passwordReset" } });
    expect(mail.to).toBe("forgetful@test.dev");
    // The raw token only goes out by email; recreate one we know for the test.
    const { hashToken } = await import("@/server/auth/accounts");
    await db.user.update({ where: { id: userId }, data: { passwordResetHash: hashToken("tok"), passwordResetExpiresAt: new Date(Date.now() + 60_000) } });
    await resetPassword("tok", "brand-new-password");
    await expect(authenticate("forgetful@test.dev", "brand-new-password")).resolves.toMatchObject({ id: userId });
    expect(await db.session.count({ where: { userId } })).toBe(0);
    await expect(resetPassword("tok", "another-password-1")).rejects.toThrow(/expired or already been used/);
  });

  it("says nothing about whether an email has an account", async () => {
    await expect(requestPasswordReset("nobody@nowhere.dev")).resolves.toBeUndefined();
    expect(await db.emailLog.count({ where: { template: "passwordReset" } })).toBe(0);
  });
});

describe("two-step login", () => {
  it("needs a valid code to switch on, then accepts each code once, plus one-time backup codes", async () => {
    const { userId } = await makeUser();
    const { secret } = await beginTotpSetup(userId);
    await expect(confirmTotpSetup(userId, "000000")).rejects.toThrow(/didn't match/);
    const codes = await confirmTotpSetup(userId, hotp(secret, stepAt()));
    expect(codes).toHaveLength(10);

    // The code used to switch it on can't be replayed at login; the next one works once.
    expect(await verifySecondFactor(userId, hotp(secret, stepAt()))).toBe(false);
    const next = hotp(secret, stepAt() + 1);
    expect(await verifySecondFactor(userId, next)).toBe(true);
    expect(await verifySecondFactor(userId, next)).toBe(false);

    expect(await verifySecondFactor(userId, codes[0].toLowerCase())).toBe(true);
    expect(await verifySecondFactor(userId, codes[0])).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).backupCodeHashes).toHaveLength(9);
  });

  it("the half-finished login cookie is signed and expires", () => {
    const v = signPendingLogin("user-1", 1_000);
    expect(readPendingLogin(v, 2_000)).toBe("user-1");
    expect(readPendingLogin(v, 1_000 + 11 * 60_000)).toBeNull();
    expect(readPendingLogin(v.replace("user-1", "user-2"), 2_000)).toBeNull();
  });
});

describe("report a problem", () => {
  it("files the ticket against the account's own email and confirms by email", async () => {
    const { userId } = await makeUser("helpme");
    const { ref } = await createTicket(userId, { email: "spoof@else.dev", category: "PAYMENT", message: "My top-up didn't arrive in my wallet" });
    const t = await db.supportTicket.findFirstOrThrow();
    expect(t.email).toBe("helpme@test.dev");
    expect(t.id.slice(0, 6).toUpperCase()).toBe(ref);
    expect(await db.emailLog.count({ where: { template: "supportReceived" } })).toBe(1);
  });
});
