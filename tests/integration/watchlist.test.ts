import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { scheduleDrops } from "@/server/player-drops";
import { applyMarketValues } from "@/server/tiering";
import { alertNewListing, alertValueMoves, announceLiveDrops, announceWatchedMarket, watcherCounts, isWatching, myWatchlist, unwatchPlayer, watchPlayer } from "@/server/watchlist";
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

  it("alerts once when a watched player's value moves 10% or more", async () => {
    const u = await makeUser("valuewatch");
    const t = await db.cardTemplate.findFirstOrThrow({ where: { edition: "STANDARD", active: true } });
    await watchPlayer(u.userId, t.playerId);
    const val = (mp: number, minsAgo: number) =>
      db.mPValuation.create({ data: { playerId: t.playerId, category: t.category, valueMp: mp, method: "t", signals: {}, computedAt: new Date(Date.now() - minsAgo * 60_000) } });
    await val(20, 30);
    expect(await alertValueMoves()).toBe(0); // first value is the baseline
    await val(19, 20);
    expect(await alertValueMoves()).toBe(0); // 5%: no alert
    await val(17, 10);
    expect(await alertValueMoves()).toBe(1); // 15% down from 20
    expect(await alertValueMoves()).toBe(0); // told once
    const n = await db.notification.findFirstOrThrow({ where: { userId: u.userId, kind: "value" } });
    expect(n.title).toContain("down 15% to 17 MX");
  });

  it("tells watchers when a player comes onto any market (MATCHX buy now, auctions), once; cards show how many are watching", async () => {
    const a = await makeUser("mkwatch1");
    const b = await makeUser("mkwatch2");
    const card = await db.cardInstance.findFirstOrThrow({ where: { supplyState: "AVAILABLE", packable: true }, include: { template: true } });
    await watchPlayer(a.userId, card.template.playerId);
    await watchPlayer(b.userId, card.template.playerId);
    expect((await watcherCounts([card.template.playerId])).get(card.template.playerId)).toBe(2);
    const { cardViews } = await import("@/server/views");
    expect((await cardViews({ id: card.id }))[0].watchers).toBe(2);

    await db.marketListing.create({ data: { cardId: card.id, sellerId: null, house: true, askingPriceMinor: 250, expiresAt: new Date(Date.now() + 86_400_000) } });
    expect(await announceWatchedMarket()).toBe(2);
    expect(await announceWatchedMarket()).toBe(2); // attempted again, but each is only told once
    const n = await db.notification.findMany({ where: { userId: a.userId, kind: "listing" } });
    expect(n).toHaveLength(1);
    expect(n[0].body).toContain("2 managers are watching");
  });
});
