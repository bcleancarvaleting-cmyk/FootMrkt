import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { scheduleDrops } from "@/server/player-drops";
import { applyMarketValues } from "@/server/tiering";
import { alertNewListing, announceLiveDrops, isWatching, myWatchlist, unwatchPlayer, watchPlayer } from "@/server/watchlist";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("watchlist and alerts", () => {
  it("alerts on drops going live, listings under the alert price, and tier changes — once each", async () => {
    const u = await makeUser("watcher");
    const other = await makeUser("cheapskate");
    const admin = await makeUser("dropper");
    const tpl = await db.cardTemplate.findFirstOrThrow({ where: { category: "BRONZE", edition: "STANDARD", active: true }, include: { player: true } });
    const playerId = tpl.playerId;

    await watchPlayer(u.userId, playerId);
    await watchPlayer(other.userId, playerId, 200); // only tell me at 2.00 MX or less
    expect(await isWatching(u.userId, playerId)).toBe(true);
    await expect(watchPlayer(u.userId, playerId, 5)).rejects.toMatchObject({ code: "RANGE" });

    // A drop goes live → both watchers told, once.
    await scheduleDrops(admin.userId, [{ playerId, priceMinor: 126, liveAt: new Date(Date.now() - 1000) }]);
    expect(await announceLiveDrops()).toBe(2);
    await announceLiveDrops();
    expect(await db.notification.count({ where: { kind: "drop" } })).toBe(2);
    expect((await myWatchlist(u.userId))[0]).toMatchObject({ playerId, dropPriceMinor: 126 });

    // A listing at 3.00 MX → only the watcher with no price limit hears about it; the seller never does.
    await alertNewListing({ id: "00000000-0000-0000-0000-000000000001", sellerId: admin.userId, askingPriceMinor: 300, playerId, playerName: tpl.player.displayName });
    expect(await db.notification.count({ where: { kind: "listing", userId: u.userId } })).toBe(1);
    expect(await db.notification.count({ where: { kind: "listing", userId: other.userId } })).toBe(0);
    await alertNewListing({ id: "00000000-0000-0000-0000-000000000002", sellerId: u.userId, askingPriceMinor: 150, playerId, playerName: tpl.player.displayName });
    expect(await db.notification.count({ where: { kind: "listing", userId: other.userId } })).toBe(1);
    expect(await db.notification.count({ where: { kind: "listing", userId: u.userId } })).toBe(1);

    // Value rises past the Gold line → tier-change alert.
    await applyMarketValues([{ playerId, valueGbp: 30_000_000, source: "test", at: new Date() }]);
    expect(await db.notification.count({ where: { kind: "tier", userId: u.userId } })).toBe(1);

    await unwatchPlayer(u.userId, playerId);
    expect(await myWatchlist(u.userId)).toEqual([]);
  });
});
