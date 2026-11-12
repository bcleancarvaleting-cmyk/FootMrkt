import { beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db";
import { openPack } from "@/server/packs";
import { createSimMatchday } from "@/server/sim-matchday";
import { credit } from "@/server/wallet";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("reset for launch", () => {
  it("removes every player and everything they did, keeps the data, and gives admins a fresh starter pack", async () => {
    const { resetForLaunch } = await import("@/server/launch-reset");
    const admin = await makeUser("resetadmin");
    await db.user.update({ where: { id: admin.userId }, data: { role: "ADMIN" } });
    const a = await makeUser("tester1");
    const b = await makeUser("tester2");
    await openPack(a.userId, a.starterEntitlementId!);
    await openPack(admin.userId, admin.starterEntitlementId!);
    await withTx((tx) => credit(tx, { userId: b.userId, amountMinor: 999, kind: "DEPOSIT", bucket: "CASH", refId: "t-dep" }));
    // A rare find on a pool card someone owns.
    const owned = await db.cardInstance.findFirstOrThrow({ where: { ownerId: a.userId, template: { edition: "STANDARD" } } }).catch(() => null);
    const std = owned ?? (await db.cardInstance.findFirstOrThrow({ where: { template: { edition: "STANDARD" } } }));
    await db.cardInstance.update({ where: { id: std.id }, data: { ownerId: a.userId, supplyState: "HELD" } });
    const t = await db.cardTemplate.findUniqueOrThrow({ where: { id: std.templateId } });
    await db.cardFinish.create({ data: { kind: "RAINBOW", playerId: t.playerId, serial: 1, cardId: std.id } });
    // A sim matchday, and a player drop still on sale.
    await createSimMatchday(admin.userId, { kickoffAt: new Date(Date.now() + 60 * 60_000) }, new Date());
    const pool = await db.cardInstance.findFirstOrThrow({ where: { supplyState: "AVAILABLE", template: { edition: "STANDARD" } } });
    await db.cardInstance.update({ where: { id: pool.id }, data: { supplyState: "RESERVED", packable: false } });
    await db.marketListing.create({ data: { cardId: pool.id, house: true, askingPriceMinor: 200, currency: "MX", expiresAt: new Date(Date.now() + 86_400_000) } });
    const players = await db.player.count();
    await (await import("@/server/valuation")).revalueAll();

    await expect(resetForLaunch(admin.userId, "nope")).rejects.toMatchObject({ code: "CONFIRM" });
    const r = await resetForLaunch(admin.userId, "reset for launch");
    expect(r.playersRemoved).toBe(2);

    expect(await db.user.count()).toBe(1);
    expect(await db.walletEntry.count()).toBe(0);
    expect(await db.cardFinish.count()).toBe(0);
    expect(await db.cardOwnership.count()).toBe(0);
    expect(await db.cardInstance.count({ where: { template: { edition: { in: ["STARTER", "LOAN"] } } } })).toBe(0);
    expect(await db.cardInstance.count({ where: { ownerId: { not: null } } })).toBe(0);
    // Back to MATCHX: in the pool, or picked straight back onto the MATCHX market.
    const back = await db.cardInstance.findUniqueOrThrow({ where: { id: std.id } });
    expect(back.ownerId).toBeNull();
    expect(["AVAILABLE", "RESERVED"]).toContain(back.supplyState);
    expect(await db.gameweek.count({ where: { simulated: true } })).toBe(0);
    // Kept: the data and the player drop.
    expect(await db.player.count()).toBe(players);
    expect(await db.marketListing.findFirstOrThrow({ where: { cardId: pool.id } })).toMatchObject({ status: "ACTIVE", house: true });
    // The MATCHX market: at most 3 copies of each player on sale.
    const perTemplate = await db.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "MarketListing" ml JOIN "CardInstance" c ON c.id = ml."cardId" WHERE ml.house AND ml.status = 'ACTIVE' AND c.packable GROUP BY c."templateId"`;
    expect(perTemplate.length).toBeGreaterThan(0);
    expect(Math.max(...perTemplate.map((r) => r.n))).toBeLessThanOrEqual(3);
    expect(r.marketListed).toBeGreaterThan(0);
    // The admin starts again with a starter pack to open.
    expect(await db.packEntitlement.count({ where: { userId: admin.userId, status: "UNOPENED" } })).toBeGreaterThan(0);
  });
});
