import { beforeEach, describe, expect, it } from "vitest";
import { completeSet, setProgress } from "@/server/collections";
import { db, withTx } from "@/server/db";
import { grantPack, openPack } from "@/server/packs";
import { executeRelease, scheduleRelease, supplyReport } from "@/server/supply";
import { buildWorld, makeUser, resetDb } from "./fixtures";

let sportId: string;
beforeEach(async () => {
  await resetDb();
  sportId = (await buildWorld()).id;
});

describe("controlled supply (spec §7.1)", () => {
  it("releases are idempotent, respect maxSupply, and schedule the next week", async () => {
    const before = await db.cardInstance.count();
    const r = await scheduleRelease(sportId, new Date(), { perTemplate: { BRONZE: 50, SILVER: 0, GOLD: 0 }, overrides: {} }, null);
    const first = await executeRelease(r.id, null);
    const again = await executeRelease(r.id, null);
    expect(again).toMatchObject({ minted: 0, skipped: "EXECUTED" });
    // maxSupply is 20 per template and 3 were already minted → 17 each.
    const bronzeTemplates = await db.cardTemplate.count({ where: { category: "BRONZE", edition: "STANDARD" } });
    expect(first.minted).toBe(bronzeTemplates * 17);
    expect(await db.cardInstance.count()).toBe(before + first.minted);
    expect(await db.supplyRelease.count({ where: { status: "SCHEDULED" } })).toBe(1);
    expect(await db.adminAuditLog.count({ where: { action: "supply.execute" } })).toBe(2);
    expect((await supplyReport()).reconciled).toBe(true);
  });
});

describe("collection completion and recirculation (spec §8.1)", () => {
  it("consumes the set atomically, returns cards to the pool and keeps history", async () => {
    const { userId } = await makeUser();
    // Build a one-template set from a card the user really pulls.
    const ent = await withTx((tx) => grantPack(tx, { userId, skuCode: "football-bronze", source: "DEV", sourceRef: "s1" }));
    const res = await openPack(userId, ent.id);
    const card = await db.cardInstance.findUniqueOrThrow({ where: { id: res.cards[0].cardId } });
    const set = await db.collectionSet.create({
      data: { sportId, code: "t", name: "T", description: "", requirements: { create: [{ templateId: card.templateId }] } },
    });

    const progress = await setProgress(userId);
    expect(progress.find((p) => p.set.id === set.id)!.complete).toBe(true);

    const c1 = await completeSet(userId, set.id, "complete-1");
    const c2 = await completeSet(userId, set.id, "complete-1");
    expect(c2.id).toBe(c1.id);

    const after = await db.cardInstance.findUniqueOrThrow({ where: { id: card.id } });
    expect(after).toMatchObject({ supplyState: "RECIRCULATING", ownerId: null, recycledCount: 1, lock: "NONE" });
    const own = await db.cardOwnership.findMany({ where: { cardId: card.id } });
    expect(own).toHaveLength(1);
    expect(own[0].releasedVia).toBe("COLLECTION_COMPLETION");

    // With nothing left, completing again fails.
    await expect(completeSet(userId, set.id, "complete-2")).rejects.toMatchObject({ code: "INCOMPLETE" });
    expect((await supplyReport()).recirculatingInPool).toBe(1);
    expect((await supplyReport()).reconciled).toBe(true);
  });

  it("recirculated cards can be issued again through a normal pack opening", async () => {
    await db.cardInstance.updateMany({ where: { template: { category: "BRONZE" } }, data: { supplyState: "RETIRED" } });
    const target = await db.cardInstance.findFirstOrThrow({ where: { template: { category: "BRONZE", player: { position: "GK" } } } });
    await db.cardInstance.updateMany({
      where: { template: { category: "BRONZE" }, OR: [{ id: target.id }, { template: { player: { position: { not: "GK" } } } }] },
      data: { supplyState: "AVAILABLE" },
    });
    await db.cardInstance.update({ where: { id: target.id }, data: { supplyState: "RECIRCULATING", recycledCount: 1 } });
    const { userId } = await makeUser();
    // A one-card bronze pack, opened until the pool is empty, must eventually pull the recirculated card.
    // (Six-card packs can stall with a few copies of the same player left, which made this test flaky.)
    const sport = await db.sport.findFirstOrThrow();
    await db.packSku.create({
      data: { sportId: sport.id, code: "test-one-bronze", version: 1, name: "One", kind: "REGULAR", priceMinor: 100, config: { mode: "POOL", nonTradeable: false, uniquePlayers: true, slots: [{ label: "B", count: 1, base: "BRONZE", upgrades: [] }] } },
    });
    const pulled = new Set<string>();
    for (let i = 0; i < 200 && !pulled.has(target.id); i++) {
      const ent = await withTx((tx) => grantPack(tx, { userId, skuCode: "test-one-bronze", source: "DEV", sourceRef: `r${i}` }));
      try {
        (await openPack(userId, ent.id)).cards.forEach((c) => pulled.add(c.cardId));
      } catch {
        break;
      }
    }
    expect(pulled.has(target.id)).toBe(true);
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: target.id } })).ownerId).toBe(userId);
  });
});
