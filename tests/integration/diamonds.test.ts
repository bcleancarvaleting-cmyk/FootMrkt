import { beforeEach, describe, expect, it } from "vitest";
import { type RandomSource, seededRandom } from "@/domain/random";
import { db, withTx } from "@/server/db";
import { grantPack, openPack } from "@/server/packs";
import { setSetting } from "@/server/settings";
import { supplyReport } from "@/server/supply";
import { cardViews } from "@/server/views";
import { buildWorld, makeUser, resetDb } from "./fixtures";

// A Diamond roll uses this range; nothing else in a test pack draws over a range this size.
const ONE_IN = 9973;
/** Seeded randomness, except every Diamond roll hits. */
const alwaysDiamond = (seed: number): RandomSource => {
  const base = seededRandom(seed);
  return { int: (n) => (n === ONE_IN ? 0 : base.int(n)) };
};

beforeEach(async () => {
  await resetDb();
  await buildWorld({ perTemplate: { BRONZE: 3, SILVER: 3, GOLD: 8 } });
});

async function goldPack(userId: string, ref: string, rng: RandomSource) {
  const ent = await withTx((tx) => grantPack(tx, { userId, skuCode: "football-gold", source: "DEV", sourceRef: ref }));
  return openPack(userId, ent.id, rng);
}

describe("Diamond cards", () => {
  it("a Gold drawn from a pack can come out Diamond: numbered per player, cosmetic only, logged", async () => {
    const admin = await makeUser("dadmin");
    await setSetting(admin.userId, "diamondOneIn", ONE_IN);
    const u = await makeUser("lucky");
    const res = await goldPack(u.userId, "d1", alwaysDiamond(1));
    const golds = res.cards.filter((c) => c.category === "GOLD");
    expect(golds.length).toBeGreaterThan(0);

    const diamonds = await db.diamondCard.findMany({ where: { cardId: { in: golds.map((g) => g.cardId) } } });
    expect(diamonds).toHaveLength(golds.length);
    expect(diamonds.every((d) => d.serial === 1)).toBe(true);
    // Same card in every other way: still a Gold, same template, same owner.
    const views = await cardViews({ id: { in: golds.map((g) => g.cardId) } });
    expect(views.every((v) => v.category === "GOLD" && v.diamond === 1)).toBe(true);
    const opening = await db.packOpening.findUniqueOrThrow({ where: { id: res.openingId } });
    const audit = opening.rngAudit as { draws: Array<{ purpose: string; range: number }> };
    expect(audit.draws.filter((d) => d.purpose === "diamond")).toHaveLength(golds.length);
    expect((await supplyReport()).reconciled).toBe(true);
  });

  it("never more than 5 Diamonds of any player, however lucky the draws", async () => {
    const admin = await makeUser("dadmin2");
    await setSetting(admin.userId, "diamondOneIn", ONE_IN);
    // Use up every Gold player's 5 Diamonds.
    const golds = await db.cardTemplate.findMany({ where: { category: "GOLD", edition: "STANDARD" }, include: { instances: { take: 5 } } });
    for (const t of golds) {
      await db.diamondCard.createMany({ data: t.instances.map((ci, i) => ({ playerId: t.playerId, cardId: ci.id, serial: i + 1 })) });
    }
    const before = await db.diamondCard.count();
    const u = await makeUser("unlucky");
    await goldPack(u.userId, "d2", alwaysDiamond(2));
    expect(await db.diamondCard.count()).toBe(before);
    // And the database itself refuses a 6th.
    const extra = await db.cardInstance.findFirstOrThrow({ where: { templateId: golds[0].id, diamond: null } });
    await expect(db.diamondCard.create({ data: { playerId: golds[0].playerId, cardId: extra.id, serial: 6 } })).rejects.toThrow();
  });

  it("at normal odds most Golds are just Gold", async () => {
    const u = await makeUser("normal");
    const res = await goldPack(u.userId, "d3", seededRandom(3));
    expect(res.cards.some((c) => c.category === "GOLD")).toBe(true);
    expect(await db.diamondCard.count()).toBeLessThanOrEqual(1);
  });
});
