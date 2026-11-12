import { beforeEach, describe, expect, it } from "vitest";
import { portfolio } from "@/server/binder";
import { db } from "@/server/db";
import { openPack } from "@/server/packs";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("club portfolio", () => {
  it("splits the squad's value into tradeable and untradeable, each with its own change", async () => {
    const { userId, starterEntitlementId } = await makeUser("pfsplit");
    const { cards } = await openPack(userId, starterEntitlementId); // starter cards: untradeable
    // Make two of them tradeable, and give every card a rising value history.
    await db.cardInstance.updateMany({ where: { id: { in: cards.slice(0, 2).map((c) => c.cardId) } }, data: { tradeStatus: "TRADEABLE" } });
    const tpls = await db.cardInstance.findMany({ where: { id: { in: cards.map((c) => c.cardId) } }, select: { template: { select: { playerId: true, category: true } } } });
    const day = 86_400_000;
    for (const t of tpls) {
      await db.mPValuation.createMany({
        data: [
          { playerId: t.template.playerId, category: t.template.category, valueMp: 1, method: "t", signals: {}, computedAt: new Date(Date.now() - 2 * day) },
          { playerId: t.template.playerId, category: t.template.category, valueMp: 1.5, method: "t", signals: {}, computedAt: new Date(Date.now() - day) },
        ],
        skipDuplicates: true,
      });
    }
    const pf = await portfolio(userId);
    expect(pf.tradeable.count).toBe(2);
    expect(pf.untradeable.count).toBe(cards.length - 2);
    expect(pf.tradeable.value + pf.untradeable.value).toBeCloseTo(pf.value, 2);
    expect(pf.tradeable.changePct).toBe(50);
    expect(pf.untradeable.changePct).toBe(50);
  });
});
