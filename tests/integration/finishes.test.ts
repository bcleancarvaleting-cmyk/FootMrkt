import { beforeEach, describe, expect, it } from "vitest";
import { type RandomSource, seededRandom } from "@/domain/random";
import { db, withTx } from "@/server/db";
import { grantPack, openPack } from "@/server/packs";
import { setSetting } from "@/server/settings";
import { supplyReport } from "@/server/supply";
import { cardViews } from "@/server/views";
import { buildWorld, makeUser, resetDb } from "./fixtures";

// Finish rolls use these ranges; nothing else in a test pack draws over ranges this size.
const DIAMOND_ONE_IN = 9973;
const RUBY_ONE_IN = 9967;
/** Seeded randomness, except the chosen finish rolls always hit. */
const lucky = (seed: number, hit: number[]): RandomSource => {
  const base = seededRandom(seed);
  return { int: (n) => (hit.includes(n) ? 0 : base.int(n)) };
};

beforeEach(async () => {
  await resetDb();
  await buildWorld({ perTemplate: { BRONZE: 3, SILVER: 3, GOLD: 16 } });
  const admin = await makeUser("fadmin");
  await setSetting(admin.userId, "diamondOneIn", DIAMOND_ONE_IN);
  await setSetting(admin.userId, "rubyOneIn", RUBY_ONE_IN);
});

async function goldPack(userId: string, ref: string, rng: RandomSource) {
  const ent = await withTx((tx) => grantPack(tx, { userId, skuCode: "football-gold", source: "DEV", sourceRef: ref }));
  return openPack(userId, ent.id, rng);
}

describe("Ruby and Diamond finishes (cosmetic only)", () => {
  it("a Gold from a pack can come out Diamond — numbered per player, otherwise the same Gold, logged", async () => {
    const u = await makeUser("lucky");
    const res = await goldPack(u.userId, "d1", lucky(1, [DIAMOND_ONE_IN]));
    const golds = res.cards.filter((c) => c.category === "GOLD");
    expect(golds.length).toBeGreaterThan(0);
    const finishes = await db.cardFinish.findMany({ where: { cardId: { in: golds.map((g) => g.cardId) } } });
    expect(finishes).toHaveLength(golds.length);
    expect(finishes.every((f) => f.kind === "DIAMOND" && f.serial === 1)).toBe(true);
    const views = await cardViews({ id: { in: golds.map((g) => g.cardId) } });
    expect(views.every((v) => v.category === "GOLD" && v.finish?.kind === "DIAMOND" && v.finish.of === 5)).toBe(true);
    const opening = await db.packOpening.findUniqueOrThrow({ where: { id: res.openingId } });
    const audit = opening.rngAudit as { draws: Array<{ purpose: string }> };
    expect(audit.draws.filter((d) => d.purpose === "finish").length).toBeGreaterThanOrEqual(golds.length);
    expect((await supplyReport()).reconciled).toBe(true);
  });

  it("a Gold can come out Ruby (red), 1 of 10 per player", async () => {
    const u = await makeUser("ruby");
    const res = await goldPack(u.userId, "r1", lucky(4, [RUBY_ONE_IN]));
    const golds = res.cards.filter((c) => c.category === "GOLD");
    const views = await cardViews({ id: { in: golds.map((g) => g.cardId) } });
    expect(views.every((v) => v.finish?.kind === "RUBY" && v.finish.serial === 1 && v.finish.of === 10)).toBe(true);
  });

  it("never more than 10 Rubies or 5 Diamonds of any player, however lucky the draws", async () => {
    const golds = await db.cardTemplate.findMany({ where: { category: "GOLD", edition: "STANDARD" }, include: { instances: { take: 15, orderBy: { serial: "asc" } } } });
    for (const t of golds) {
      await db.cardFinish.createMany({
        data: [
          ...t.instances.slice(0, 5).map((ci, i) => ({ kind: "DIAMOND" as const, playerId: t.playerId, cardId: ci.id, serial: i + 1 })),
          ...t.instances.slice(5, 15).map((ci, i) => ({ kind: "RUBY" as const, playerId: t.playerId, cardId: ci.id, serial: i + 1 })),
        ],
      });
    }
    const before = await db.cardFinish.count();
    const u = await makeUser("unlucky");
    await goldPack(u.userId, "d2", lucky(2, [DIAMOND_ONE_IN, RUBY_ONE_IN]));
    expect(await db.cardFinish.count()).toBe(before);
    // The database itself refuses an 11th Ruby or a 6th Diamond.
    const extra = await db.cardInstance.findFirstOrThrow({ where: { templateId: golds[0].id, finish: null } });
    await expect(db.cardFinish.create({ data: { kind: "RUBY", playerId: golds[0].playerId, cardId: extra.id, serial: 11 } })).rejects.toThrow();
    await expect(db.cardFinish.create({ data: { kind: "DIAMOND", playerId: golds[0].playerId, cardId: extra.id, serial: 6 } })).rejects.toThrow();
  });

  it("at normal odds most Golds are just Gold", async () => {
    const u = await makeUser("normal");
    const res = await goldPack(u.userId, "d3", seededRandom(3));
    expect(res.cards.some((c) => c.category === "GOLD")).toBe(true);
    expect(await db.cardFinish.count()).toBeLessThanOrEqual(1);
  });
});
