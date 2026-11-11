import { beforeEach, describe, expect, it } from "vitest";
import { adminDisableTwoStep, adminPasswordReset, adminSignOutEverywhere, adminVerifyEmail, blockUser, unblockUser } from "@/server/admin-users";
import { authenticate, createSession, userForSessionToken } from "@/server/auth/accounts";
import { resetPassword } from "@/server/auth/security";
import { db, withTx } from "@/server/db";
import { openPack, grantPack } from "@/server/packs";
import { createListing, makeOffer } from "@/server/transfers";
import { credit, balancesFor } from "@/server/wallet";
import { buildWorld, makeTrader, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
  process.env.LEGAL_GATES_CLEARED = "MARKET,PAID_PACKS";
  process.env.FLAG_MARKET = "true";
  process.env.FLAG_PAID_PACKS = "true";
  process.env.FLAG_PACK_SHOP = "true";
});

async function admin() {
  const a = await makeUser("boss");
  await db.user.update({ where: { id: a.userId }, data: { role: "ADMIN" } });
  return a.userId;
}

describe("admin user tools", () => {
  it("block signs them out, stops login and trading, takes listings down and refunds offers; unblock restores", async () => {
    const adminId = await admin();
    const cheat = await makeTrader("cheat");
    const buyer = await makeTrader("honest");
    await withTx((tx) => credit(tx, { userId: buyer.userId, amountMinor: 1000, kind: "CHALLENGE_REWARD", bucket: "BONUS", refId: "seed-honest" }));
    const ent = await withTx((tx) => grantPack(tx, { userId: cheat.userId, skuCode: "football-bronze", source: "DEV", sourceRef: "dev:cheat" }));
    const cardId = (await openPack(cheat.userId, ent.id)).cards[0].cardId;
    const listing = await createListing(cheat.userId, { cardId, askingPriceMinor: 500 });
    await makeOffer(buyer.userId, listing.id, 300);
    expect((await balancesFor(buyer.userId)).total).toBe(700);
    const { token } = await createSession(cheat.userId);

    await expect(blockUser(adminId, cheat.userId, { reason: "x" })).rejects.toThrow(/reason/);
    expect(await blockUser(adminId, cheat.userId, { reason: "Multiple accounts" })).toEqual({ listings: 1 });
    expect(await userForSessionToken(token)).toBeNull();
    const email = (await db.user.findUniqueOrThrow({ where: { id: cheat.userId } })).email;
    await expect(authenticate(email, "correct-horse-battery")).rejects.toMatchObject({ code: "SUSPENDED" });
    expect((await db.marketListing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("CANCELLED");
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: cardId } })).lock).toBe("NONE");
    expect((await balancesFor(buyer.userId)).total).toBe(1000);
    await expect(blockUser(adminId, cheat.userId, { reason: "again" })).rejects.toMatchObject({ code: "ALREADY" });
    expect(await db.adminAuditLog.count({ where: { action: "user.block", entityId: cheat.userId } })).toBe(1);

    await unblockUser(adminId, cheat.userId);
    expect((await db.user.findUniqueOrThrow({ where: { id: cheat.userId } })).status).toBe("ACTIVE");
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: cardId } })).ownerId).toBe(cheat.userId);
  });

  it("can't be used on yourself or another admin", async () => {
    const adminId = await admin();
    const other = await makeUser("other-admin");
    await db.user.update({ where: { id: other.userId }, data: { role: "ADMIN" } });
    await expect(blockUser(adminId, adminId, { reason: "testing" })).rejects.toMatchObject({ code: "SELF" });
    await expect(blockUser(adminId, other.userId, { reason: "testing" })).rejects.toMatchObject({ code: "ADMIN" });
    await expect(adminPasswordReset(adminId, other.userId)).rejects.toMatchObject({ code: "ADMIN" });
  });

  it("password reset link works once; confirm email, turn off two-step, sign out everywhere", async () => {
    const adminId = await admin();
    const u = await makeUser("forgetful");
    await createSession(u.userId);
    const url = await adminPasswordReset(adminId, u.userId);
    const token = new URL(url).searchParams.get("token")!;
    await resetPassword(token, "brand-new-password-1");
    await expect(resetPassword(token, "another-password-22")).rejects.toMatchObject({ code: "BAD_TOKEN" });
    const email = (await db.user.findUniqueOrThrow({ where: { id: u.userId } })).email;
    await expect(authenticate(email, "brand-new-password-1")).resolves.toMatchObject({ id: u.userId });

    await db.user.update({ where: { id: u.userId }, data: { emailVerifiedAt: null, totpSecret: "ABC", totpEnabledAt: new Date() } });
    await adminVerifyEmail(adminId, u.userId);
    await adminDisableTwoStep(adminId, u.userId);
    const after = await db.user.findUniqueOrThrow({ where: { id: u.userId } });
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(after.totpEnabledAt).toBeNull();
    await createSession(u.userId);
    await createSession(u.userId);
    expect(await adminSignOutEverywhere(adminId, u.userId)).toBe(2);
  });
});
