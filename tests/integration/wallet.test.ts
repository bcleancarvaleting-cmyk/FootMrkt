import { beforeEach, describe, expect, it } from "vitest";
import { completeSet } from "@/server/collections";
import { db, withTx } from "@/server/db";
import { grantPack, openPack } from "@/server/packs";
import { balanceMinor, balancesFor, buyPackWithCredit, buyPackWithXp, credit, creditXp } from "@/server/wallet";
import { buildWorld, makeUser, resetDb } from "./fixtures";

let sportId: string;
beforeEach(async () => {
  process.env.FLAG_PACK_SHOP = "true";
  await resetDb();
  sportId = (await buildWorld()).id;
});

async function completeOneSet(userId: string) {
  const ent = await withTx((tx) => grantPack(tx, { userId, skuCode: "football-bronze", source: "DEV", sourceRef: `w:${userId}` }));
  const res = await openPack(userId, ent.id);
  const card = await db.cardInstance.findUniqueOrThrow({ where: { id: res.cards[0].cardId } });
  const set = await db.collectionSet.create({
    data: { sportId, code: `s-${userId}`, name: "Test set", description: "", requirements: { create: [{ templateId: card.templateId }] } },
  });
  return completeSet(userId, set.id, `k-${userId}`);
}

describe("MX credit (set rewards)", () => {
  it("completing a set awards exactly 10 MX once, even if retried", async () => {
    const { userId } = await makeUser();
    const c = await completeOneSet(userId);
    await completeSet(userId, c.setId, `k-${userId}`);
    expect(await balanceMinor(userId)).toBe(1000);
    expect(await db.walletEntry.count({ where: { userId, kind: "SET_REWARD" } })).toBe(1);
  });

  it("credit buys packs at 1 MX ≈ £1, refuses overspending, and is idempotent per click", async () => {
    const { userId } = await makeUser();
    await completeOneSet(userId);
    const gold = await buyPackWithCredit(userId, "football-gold", "click-1");
    const again = await buyPackWithCredit(userId, "football-gold", "click-1");
    expect(again.id).toBe(gold.id);
    expect(gold.source).toBe("MP_CREDIT");
    expect(await balanceMinor(userId)).toBe(1000 - 999);
    await expect(buyPackWithCredit(userId, "football-bronze", "click-2")).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    const opened = await openPack(userId, gold.id);
    expect(opened.cards).toHaveLength(6);
  });

  it("XP buys packs at the admin exchange rate (XP per £1), once per click, never into minus", async () => {
    const { userId } = await makeUser();
    await withTx((tx) => creditXp(tx, { userId, xp: 1000, refId: "xp-1" }));
    // Default 200 XP = £1 (1,000 XP = £5), so a £2.99 Bronze pack is 598 XP.
    const p = await buyPackWithXp(userId, "football-bronze", "x-1");
    expect((await buyPackWithXp(userId, "football-bronze", "x-1")).id).toBe(p.id);
    expect((await balancesFor(userId)).xp).toBe(1000 - 598);
    await expect(buyPackWithXp(userId, "football-bronze", "x-2")).rejects.toMatchObject({ code: "INSUFFICIENT_XP" });
    // The admin changes the rate: prices follow.
    await db.appSetting.create({ data: { key: "xpPerMx", value: 100 } });
    await buyPackWithXp(userId, "football-bronze", "x-3"); // 299 XP
    expect((await balancesFor(userId)).xp).toBe(402 - 299);
    expect((await openPack(userId, p.id)).cards).toHaveLength(6);
  });

  it("every 1,000 XP turns into £5 of credit automatically", async () => {
    const { userId } = await makeUser();
    await withTx((tx) => creditXp(tx, { userId, xp: 2350, refId: "xp-auto" }));
    const { autoConvertXp } = await import("@/server/wallet");
    expect(await autoConvertXp(userId)).toBe(2000);
    const bal = await balancesFor(userId);
    expect(bal.xp).toBe(350);
    expect(bal.bonus).toBe(1000);
    expect(await autoConvertXp(userId)).toBe(0);
  });

  it("concurrent spends can't take the balance below zero", async () => {
    const { userId } = await makeUser();
    await withTx((tx) => credit(tx, { userId, amountMinor: 600, kind: "ADMIN_ADJUSTMENT", refId: "adj-1" }));
    const results = await Promise.allSettled(["a", "b", "c"].map((k) => buyPackWithCredit(userId, "football-bronze", k)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect(await balanceMinor(userId)).toBe(600 - 2 * 299);
  });

  it("ledger entries are immutable", async () => {
    const { userId } = await makeUser();
    await withTx((tx) => credit(tx, { userId, amountMinor: 100, kind: "ADMIN_ADJUSTMENT", refId: "adj-x" }));
    await expect(db.walletEntry.updateMany({ where: { userId }, data: { amountMinor: 999999 } })).rejects.toThrow();
    await expect(db.walletEntry.deleteMany({ where: { userId } })).rejects.toThrow();
    expect(await balanceMinor(userId)).toBe(100);
  });
});

describe("pack shop switch", () => {
  it("buying packs with MX is blocked while the pack shop is coming soon", async () => {
    process.env.FLAG_PACK_SHOP = "false";
    const { userId } = await makeUser();
    await expect(buyPackWithCredit(userId, "football-bronze", "k")).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    process.env.FLAG_PACK_SHOP = "true";
  });
});
