import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { computePriceTips, priceTips, refreshPriceTips } from "@/server/valuation";
import { cardViews } from "@/server/views";
import { watchPlayer } from "@/server/watchlist";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("tipped to rise", () => {
  it("tips cards whose value is heading up from real sales, shows it on the card and tells watchers once a day", async () => {
    const t = await db.cardTemplate.findFirstOrThrow({ where: { edition: "STANDARD", active: true, category: "BRONZE" } });
    await db.mPValuation.create({ data: { playerId: t.playerId, category: t.category, valueMp: 10, method: "t", signals: {}, computedAt: new Date(Date.now() - 3600_000) } });
    // Three managers paid well over the value recently.
    const cards = await db.cardInstance.findMany({ where: { templateId: t.id }, take: 3 });
    for (const [i, c] of cards.entries()) {
      const s = await makeUser(`tipseller${i}`);
      const b = await makeUser(`tipbuyer${i}`);
      await db.marketListing.create({ data: { cardId: c.id, sellerId: s.userId, buyerId: b.userId, askingPriceMinor: 2000, soldPriceMinor: 2000, status: "SOLD", soldAt: new Date(), expiresAt: new Date() } });
    }
    const w = await makeUser("tipwatcher");
    await watchPlayer(w.userId, t.playerId);

    await computePriceTips();
    const tip = (await priceTips()).get(`${t.playerId}:${t.category}`);
    expect(tip?.pct).toBeGreaterThanOrEqual(5);
    expect(tip!.nextMp).toBeGreaterThan(tip!.nowMp);
    expect((await cardViews({ id: cards[0].id }))[0].risingPct).toBe(tip!.pct);
    expect(await db.notification.count({ where: { userId: w.userId, title: { contains: "tipped to rise" } } })).toBe(1);
    await computePriceTips();
    expect(await db.notification.count({ where: { userId: w.userId, title: { contains: "tipped to rise" } } })).toBe(1);
    expect(await refreshPriceTips()).toEqual({ skipped: "fresh" });
  });
});
