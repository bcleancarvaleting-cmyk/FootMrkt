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
  it("tips cards whose value is heading up, shows it on the card and tells watchers once a day", async () => {
    const t = await db.cardTemplate.findFirstOrThrow({ where: { edition: "STANDARD", active: true, category: "BRONZE" } });
    // Valued at £1 now, but a big real-world value puts them well up the curve: heading up.
    await db.player.update({ where: { id: t.playerId }, data: { marketValueGbp: 50_000_000 } });
    await db.mPValuation.create({ data: { playerId: t.playerId, category: t.category, valueMp: 1, method: "t", signals: {}, computedAt: new Date(Date.now() - 3600_000) } });
    const card = await db.cardInstance.findFirstOrThrow({ where: { templateId: t.id } });
    const w = await makeUser("tipwatcher");
    await watchPlayer(w.userId, t.playerId);

    await computePriceTips();
    const tip = (await priceTips()).get(`${t.playerId}:${t.category}`);
    expect(tip?.pct).toBeGreaterThanOrEqual(5);
    expect(tip!.nextMp).toBeGreaterThan(tip!.nowMp);
    expect((await cardViews({ id: card.id }))[0].risingPct).toBe(tip!.pct);
    expect(await db.notification.count({ where: { userId: w.userId, title: { contains: "tipped to rise" } } })).toBe(1);
    await computePriceTips();
    expect(await db.notification.count({ where: { userId: w.userId, title: { contains: "tipped to rise" } } })).toBe(1);
    expect(await refreshPriceTips()).toEqual({ skipped: "fresh" });
  });
});
