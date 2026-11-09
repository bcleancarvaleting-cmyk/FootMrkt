import { beforeEach, describe, expect, it } from "vitest";
import { completeSet } from "@/server/collections";
import { db, withTx } from "@/server/db";
import { grantPack, openPack } from "@/server/packs";
import { balanceMinor, buyPackWithCredit, credit } from "@/server/wallet";
import { buildWorld, makeUser, resetDb } from "./fixtures";

let sportId: string;
beforeEach(async () => {
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

describe("MP credit (set rewards)", () => {
  it("completing a set awards exactly 10 MP once, even if retried", async () => {
    const { userId } = await makeUser();
    const c = await completeOneSet(userId);
    await completeSet(userId, c.setId, `k-${userId}`);
    expect(await balanceMinor(userId)).toBe(1000);
    expect(await db.walletEntry.count({ where: { userId, kind: "SET_REWARD" } })).toBe(1);
  });

  it("credit buys packs at 1 MP ≈ £1, refuses overspending, and is idempotent per click", async () => {
    const { userId } = await makeUser();
    await completeOneSet(userId);
    const gold = await buyPackWithCredit(userId, "football-gold", "click-1");
    const again = await buyPackWithCredit(userId, "football-gold", "click-1");
    expect(again.id).toBe(gold.id);
    expect(gold.source).toBe("MP_CREDIT");
    expect(await balanceMinor(userId)).toBe(1000 - 999);
    await expect(buyPackWithCredit(userId, "football-bronze", "click-2")).rejects.toMatchObject({ code: "INSUFFICIENT_CREDIT" });
    const opened = await openPack(userId, gold.id);
    expect(opened.cards).toHaveLength(6);
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
