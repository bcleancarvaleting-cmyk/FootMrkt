import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db";
import { marketBoard } from "@/server/market-board";
import { buyNow, releaseMarketBatch } from "@/server/transfers";
import { credit } from "@/server/wallet";
import { buildWorld, makeUser, resetDb } from "./fixtures";

const ENV = { ...process.env };
beforeEach(async () => {
  await resetDb();
  await buildWorld();
  process.env.LEGAL_GATES_CLEARED = "MARKET";
  process.env.FLAG_MARKET = "true";
});
afterEach(() => {
  process.env = { ...ENV };
});

const onSale = (templateId: string) => db.marketListing.findMany({ where: { house: true, status: "ACTIVE", card: { templateId, packable: true } }, orderBy: { askingPriceMinor: "asc" } });

describe("MATCHX market", () => {
  it("launch lists up to 5 copies of every player at their £ value; each sale makes the rest 2% dearer; a new batch tops back up", async () => {
    const admin = await makeUser("mktadmin");
    const r = await releaseMarketBatch(admin.userId, { perPlayer: 5, resetValues: true });
    expect(r.listed).toBeGreaterThan(0);
    const counts = await db.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "MarketListing" ml JOIN "CardInstance" c ON c.id = ml."cardId" WHERE ml.house AND ml.status = 'ACTIVE' GROUP BY c."templateId"`;
    expect(Math.max(...counts.map((c) => c.n))).toBeLessThanOrEqual(5);
    // Every price is the player's value, £0.50–£20.
    const prices = await db.marketListing.findMany({ where: { house: true, status: "ACTIVE" }, select: { askingPriceMinor: true } });
    expect(prices.every((p) => p.askingPriceMinor >= 50 && p.askingPriceMinor <= 2000)).toBe(true);

    const board = await marketBoard({ sort: "value" });
    expect(board.rows.length).toBeGreaterThan(0);
    const top = board.rows[0];
    expect(top.copies).toBeLessThanOrEqual(5);
    const templateId = (await db.cardInstance.findUniqueOrThrow({ where: { id: top.card.id } })).templateId;
    const before = await onSale(templateId);

    const buyer = await makeUser("mktbuyer");
    await withTx((tx) => credit(tx, { userId: buyer.userId, amountMinor: 10_000, kind: "ADMIN_ADJUSTMENT", refId: "mkt-adj", bucket: "CASH" }));
    await buyNow(buyer.userId, top.listingId);
    const after = await onSale(templateId);
    expect(after).toHaveLength(before.length - 1);
    expect(after[0].askingPriceMinor).toBe(Math.min(10_000, Math.ceil(before[1].askingPriceMinor * 1.02)));

    // A new batch: back up to 5 (if the pool has copies), at the current value.
    await releaseMarketBatch(admin.userId, { perPlayer: 5 });
    const topped = await onSale(templateId);
    expect(topped.length).toBeGreaterThanOrEqual(after.length);
    expect(new Set(topped.map((l) => l.askingPriceMinor)).size).toBe(1);
  });
});
