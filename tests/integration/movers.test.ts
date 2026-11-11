import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { marketMovers } from "@/server/movers";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("market movers", () => {
  it("ranks risers and fallers over the week, the most traded and record sales", async () => {
    const [up, down] = await db.cardTemplate.findMany({ where: { active: true, edition: "STANDARD" }, take: 2 });
    const at = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);
    await db.mPValuation.createMany({
      data: [
        { playerId: up.playerId, category: up.category, valueMp: 10, method: "t", signals: {}, computedAt: at(6) },
        { playerId: up.playerId, category: up.category, valueMp: 15, method: "t", signals: {}, computedAt: at(0) },
        { playerId: down.playerId, category: down.category, valueMp: 20, method: "t", signals: {}, computedAt: at(6) },
        { playerId: down.playerId, category: down.category, valueMp: 16, method: "t", signals: {}, computedAt: at(0) },
      ],
    });
    const seller = await makeUser("mvseller");
    const card = await db.cardInstance.findFirstOrThrow({ where: { templateId: up.id } });
    await db.marketListing.create({ data: { cardId: card.id, sellerId: seller.userId, askingPriceMinor: 900, status: "SOLD", soldPriceMinor: 900, soldAt: at(1), expiresAt: at(-5) } });
    const m = await marketMovers();
    expect(m.risers[0]).toMatchObject({ playerId: up.playerId, pct: 50 });
    expect(m.fallers[0]).toMatchObject({ playerId: down.playerId, pct: -20 });
    expect(m.traded[0]).toMatchObject({ playerId: up.playerId, sales: 1, avgMinor: 900 });
    expect(m.records[0]).toMatchObject({ playerId: up.playerId, price: 900 });
  });
});
