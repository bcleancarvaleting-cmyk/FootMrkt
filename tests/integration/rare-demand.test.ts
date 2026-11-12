import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { supplyWatchedPlayer, watchedNotForSale } from "@/server/rare-demand";
import { watchPlayer } from "@/server/watchlist";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("watched players nobody is selling", () => {
  it("shows on the admin dashboard and can be put on the MATCHX market or at auction", async () => {
    const [a, b] = [await makeUser("watcher1"), await makeUser("watcher2")];
    const pool = await db.cardInstance.findFirstOrThrow({ where: { supplyState: { in: ["AVAILABLE", "RECIRCULATING"] }, template: { edition: "STANDARD" } }, include: { template: true } });
    const playerId = pool.template.playerId;
    await watchPlayer(a.userId, playerId);
    await watchPlayer(b.userId, playerId);
    const before = await watchedNotForSale();
    const row = before.rows.find((r) => r.playerId === playerId)!;
    expect(row.watchers).toBe(2);
    expect(row.tiers.find((t) => t.category === pool.template.category)!.stock).toBeGreaterThan(0);

    const admin = await makeUser("boss");
    await supplyWatchedPlayer(admin.userId, playerId, pool.template.category, "market");
    expect(await db.marketListing.count({ where: { house: true, status: "ACTIVE", card: { template: { playerId } } } })).toBe(1);
    expect((await watchedNotForSale()).rows.some((r) => r.playerId === playerId)).toBe(false);
  });
});
