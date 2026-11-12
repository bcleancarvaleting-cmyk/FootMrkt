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
  it("sign-up grants the four league starters only; the Premier League starter is 8 Premier League Silvers (7 + 1)", async () => {
    const { userId, starterEntitlementId } = await makeUser();
    const ents = await db.packEntitlement.findMany({ where: { userId }, include: { packSku: true } });
    expect(ents.map((e) => e.packSku.code).sort()).toEqual(["football-starter", "football-starter-cha", "football-starter-lg1", "football-starter-lg2"].sort());
    expect(ents.every((e) => e.source === "STARTER")).toBe(true);
    expect(ents.find((e) => e.id === starterEntitlementId)!.packSku.code).toBe("football-starter");

    const res = await openPack(userId, starterEntitlementId);
    expect(res.cards).toHaveLength(8);
    const cards = await db.cardInstance.findMany({
      where: { id: { in: res.cards.map((c) => c.cardId) } },
      include: { template: { include: { player: { include: { club: { include: { league: true } } } } } } },
    });
    expect(cards.every((c) => c.ownerId === userId && c.supplyState === "HELD" && c.tradeStatus === "NON_TRADEABLE")).toBe(true);
    expect(cards.every((c) => c.template.edition === "STARTER")).toBe(true);
    expect(new Set(cards.map((c) => c.template.playerId)).size).toBe(8);
    expect(cards.every((c) => c.template.player.club?.league.tier === 1)).toBe(true);
    expect(cards.every((c) => c.template.category === "SILVER")).toBe(true);

    const pos = (p: string) => cards.filter((c) => c.template.player.position === p).length;
    expect(pos("GK")).toBe(1);
    expect(pos("DEF") + pos("MID") + pos("ATT")).toBe(7);
    expect(Math.min(pos("DEF"), pos("MID"), pos("ATT"))).toBeGreaterThanOrEqual(2);

    const opening = await db.packOpening.findUniqueOrThrow({ where: { id: res.openingId } });
    expect(opening.configSnapshot).toMatchObject({ code: "football-starter", version: 5 });
    expect((opening.rngAudit as { source: string }).source).toBe("node:crypto");

    // The second league's starter: 8 players, all from that league.
    const cha = ents.find((e) => e.packSku.code === "football-starter-cha")!;
    const res2 = await openPack(userId, cha.id);
    const cards2 = await db.cardInstance.findMany({ where: { id: { in: res2.cards.map((c) => c.cardId) } }, include: { template: { include: { player: { include: { club: { include: { league: true } } } } } } } });
    expect(cards2).toHaveLength(8);
    expect(cards2.every((c) => c.template.player.club?.league.tier === 2)).toBe(true);
  });

  it("app-only picks: installing on a phone gives one pick per league — 1 of 4 top performers, on loan for 4 gameweeks", async () => {
    const { userId } = await makeUser();
    const { grantAppPicks } = await import("@/server/app-messages");
    expect(await grantAppPicks(userId)).toBe(4);
    expect(await grantAppPicks(userId)).toBe(0); // once only
    const ents = await db.packEntitlement.findMany({ where: { userId, sourceRef: { startsWith: "app-pick:" } }, include: { packSku: true } });
    expect(ents.map((e) => e.packSku.code).sort()).toEqual(["football-app-pick-cha", "football-app-pick-epl", "football-app-pick-lg1", "football-app-pick-lg2"]);
    const pick = ents.find((e) => e.packSku.code === "football-app-pick-cha")!;
    const { pickOptions, choosePick } = await import("@/server/picks");
    const o = await pickOptions(userId, pick.id);
    expect(o.playerIds).toHaveLength(4);
    const players = await db.player.findMany({ where: { id: { in: o.playerIds } }, include: { club: { include: { league: true } } } });
    expect(players.every((p) => p.club?.league.tier === 2)).toBe(true);
    await choosePick(userId, pick.id, o.playerIds[0]);
    const card = await db.cardInstance.findFirstOrThrow({ where: { ownerId: userId, template: { playerId: o.playerIds[0] } }, include: { template: true } });
    expect(card).toMatchObject({ tradeStatus: "NON_TRADEABLE", loanGameweeks: 4 });
    expect(card.template.edition).toBe("LOAN");
    expect(await db.notification.count({ where: { userId, kind: "APP" } })).toBe(1);
  });

  it("re-opening and concurrent opening never issue a second pack", async () => {
    const { userId, starterEntitlementId } = await makeUser();
    const [a, b] = await Promise.allSettled([openPack(userId, starterEntitlementId), openPack(userId, starterEntitlementId)]);
    const ok = [a, b].filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof openPack>>>[];
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const again = await openPack(userId, starterEntitlementId);
    expect(again.alreadyOpened).toBe(true);
    expect(await db.packOpening.count({ where: { userId } })).toBe(1);
    expect(await db.cardInstance.count({ where: { ownerId: userId } })).toBe(8);
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
