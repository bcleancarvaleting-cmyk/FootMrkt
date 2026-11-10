import { beforeEach, describe, expect, it } from "vitest";
import { categoryRank } from "@/domain/packs/config";
import { seededRandom } from "@/domain/random";
import { db, withTx } from "@/server/db";
import { grantPack, openPack } from "@/server/packs";
import { supplyReport } from "@/server/supply";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

const grant = (userId: string, skuCode: string, ref: string) =>
  withTx((tx) => grantPack(tx, { userId, skuCode, source: "DEV", sourceRef: ref }));

describe("starter pack (spec §5.2, §17)", () => {
  it("registration grants exactly one free starter pack that issues 12 locked, untradeable cards", async () => {
    const { userId, starterEntitlementId } = await makeUser();
    const ents = await db.packEntitlement.findMany({ where: { userId } });
    expect(ents).toHaveLength(1);
    expect(ents[0].source).toBe("STARTER");

    const res = await openPack(userId, starterEntitlementId);
    expect(res.cards).toHaveLength(12);
    const cards = await db.cardInstance.findMany({
      where: { id: { in: res.cards.map((c) => c.cardId) } },
      include: { template: { include: { player: { include: { club: { include: { league: true } } } } } } },
    });
    expect(cards.every((c) => c.ownerId === userId && c.supplyState === "HELD" && c.tradeStatus === "NON_TRADEABLE")).toBe(true);
    expect(cards.every((c) => c.template.edition === "STARTER")).toBe(true);
    expect(new Set(cards.map((c) => c.template.playerId)).size).toBe(12);

    const pos = (p: string) => cards.filter((c) => c.template.player.position === p).length;
    expect(pos("GK")).toBeGreaterThanOrEqual(1);
    expect(pos("DEF")).toBeGreaterThanOrEqual(2);
    expect(pos("MID")).toBeGreaterThanOrEqual(2);
    expect(pos("ATT")).toBeGreaterThanOrEqual(2);
    expect(cards.some((c) => c.template.category === "BRONZE" && c.template.player.club?.league.isTopFlight)).toBe(true);
    expect(cards.every((c) => c.template.category !== "GOLD")).toBe(true);

    const opening = await db.packOpening.findUniqueOrThrow({ where: { id: res.openingId } });
    expect(opening.configSnapshot).toMatchObject({ code: "football-starter", version: 2 });
    expect((opening.rngAudit as { source: string }).source).toBe("node:crypto");
  });

  it("re-opening and concurrent opening never issue a second pack", async () => {
    const { userId, starterEntitlementId } = await makeUser();
    const [a, b] = await Promise.allSettled([openPack(userId, starterEntitlementId), openPack(userId, starterEntitlementId)]);
    const ok = [a, b].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof openPack>>>[];
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const again = await openPack(userId, starterEntitlementId);
    expect(again.alreadyOpened).toBe(true);
    expect(await db.packOpening.count({ where: { userId } })).toBe(1);
    expect(await db.cardInstance.count({ where: { ownerId: userId } })).toBe(12);
  });

  it("another user cannot open my pack", async () => {
    const me = await makeUser();
    const other = await makeUser();
    await expect(openPack(other.userId, me.starterEntitlementId)).rejects.toMatchObject({ code: "NO_PACK" });
  });
});

describe("regular packs (spec §5.1, §5.3)", () => {
  it("issue six cards from the pool, honouring the slot floors, with an audit record", async () => {
    const { userId } = await makeUser();
    for (const [i, code] of ["football-bronze", "football-silver", "football-gold"].entries()) {
      const ent = await grant(userId, code, `t:${i}`);
      const res = await openPack(userId, ent.id, seededRandom(i));
      expect(res.cards).toHaveLength(6);
      const opening = await db.packOpening.findUniqueOrThrow({ where: { id: res.openingId } });
      const plan = (opening.rngAudit as { slots: Array<{ floor: string; issued: string }> }).slots;
      for (const s of plan) expect(categoryRank[s.issued as "GOLD"]).toBeGreaterThanOrEqual(categoryRank[s.floor as "GOLD"]);
      const cards = await db.cardInstance.findMany({ where: { id: { in: res.cards.map((c) => c.cardId) } } });
      expect(cards.every((c) => c.ownerId === userId && c.tradeStatus === "NON_TRADEABLE" /* launch period: paid packs not live */)).toBe(true);
    }
    const goldOpening = await db.packOpening.findFirstOrThrow({ where: { userId, packSku: { code: "football-gold" } }, include: { cards: { include: { card: { include: { template: { include: { player: { include: { club: { include: { league: true } } } } } } } } } } } });
    const golds = goldOpening.cards.filter((c) => c.category === "GOLD");
    expect(golds.length).toBeGreaterThanOrEqual(2);
    expect(golds.slice(0, 2).every((c) => c.card.template.player.club?.league.isTopFlight)).toBe(true);
    expect((await supplyReport()).reconciled).toBe(true);
  });

  it("never downgrades a guarantee: no Gold stock → opening refused and the pack stays unopened", async () => {
    await db.cardInstance.updateMany({ where: { template: { category: "GOLD" }, supplyState: "AVAILABLE" }, data: { supplyState: "RETIRED" } });
    const { userId } = await makeUser();
    const ent = await grant(userId, "football-gold", "g1");
    await expect(openPack(userId, ent.id)).rejects.toMatchObject({ code: "POOL_EXHAUSTED" });
    expect((await db.packEntitlement.findUniqueOrThrow({ where: { id: ent.id } })).status).toBe("UNOPENED");
    expect(await db.cardInstance.count({ where: { ownerId: userId, template: { edition: "STANDARD" } } })).toBe(0);
  });

  it("granting with the same source reference is idempotent", async () => {
    const { userId } = await makeUser();
    const a = await grant(userId, "football-bronze", "same");
    const b = await grant(userId, "football-bronze", "same");
    expect(a.id).toBe(b.id);
  });
});
