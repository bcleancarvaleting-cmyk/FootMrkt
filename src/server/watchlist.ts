import { db } from "./db";
import { DomainError } from "./errors";
import { notify } from "./notifications";
import { fmtMp } from "./wallet";

/**
 * Watchlist and alerts. Managers follow players and are told (in-app notifications) when:
 *  - MATCHX drops one of them (once the drop goes live),
 *  - another manager lists one on the Transfer list — at or under their alert price, if they set one,
 *  - the player changes tier (e.g. Bronze → Gold) after a value update,
 *  - the player's card value moves 10% or more (up or down) from the value they were last told.
 */
export const MAX_WATCHED = 100;

export async function watchPlayer(userId: string, playerId: string, maxPriceMinor?: number | null) {
  if (maxPriceMinor != null && (!Number.isInteger(maxPriceMinor) || maxPriceMinor < 10 || maxPriceMinor > 10_000)) throw new DomainError("RANGE", "Alert price: 0.10–100 MX.");
  if (!(await db.player.findUnique({ where: { id: playerId }, select: { id: true } }))) throw new DomainError("NOT_FOUND", "Player not found.");
  const existing = await db.watchItem.findUnique({ where: { userId_playerId: { userId, playerId } } });
  if (!existing && (await db.watchItem.count({ where: { userId } })) >= MAX_WATCHED) throw new DomainError("LIMIT", `You can watch up to ${MAX_WATCHED} players.`);
  return db.watchItem.upsert({
    where: { userId_playerId: { userId, playerId } },
    create: { userId, playerId, maxPriceMinor: maxPriceMinor ?? null },
    update: maxPriceMinor === undefined ? {} : { maxPriceMinor },
  });
}

export async function unwatchPlayer(userId: string, playerId: string) {
  await db.watchItem.deleteMany({ where: { userId, playerId } });
}

export async function isWatching(userId: string, playerId: string) {
  return !!(await db.watchItem.findUnique({ where: { userId_playerId: { userId, playerId } }, select: { id: true } }));
}

/** The manager's watched players with what's on offer for each right now. */
export async function myWatchlist(userId: string) {
  const items = await db.watchItem.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const players = await db.player.findMany({
    where: { id: { in: items.map((i) => i.playerId) } },
    select: { id: true, displayName: true, position: true, club: { select: { name: true } }, templates: { where: { edition: "STANDARD", active: true }, select: { category: true } } },
  });
  const listings = await db.marketListing.findMany({
    where: { status: "ACTIVE", expiresAt: { gt: new Date() }, card: { template: { playerId: { in: items.map((i) => i.playerId) } } } },
    select: { house: true, askingPriceMinor: true, liveAt: true, card: { select: { packable: true, template: { select: { playerId: true } } } } },
  });
  const now = new Date();
  return items.map((i) => {
    const p = players.find((x) => x.id === i.playerId);
    const mine = listings.filter((l) => l.card.template.playerId === i.playerId);
    const p2p = mine.filter((l) => !l.house).map((l) => l.askingPriceMinor);
    const drop = mine.find((l) => l.house && !l.card.packable && (!l.liveAt || l.liveAt <= now));
    return {
      playerId: i.playerId,
      name: p?.displayName ?? "Unknown player",
      position: p?.position ?? null,
      club: p?.club?.name ?? null,
      tier: p?.templates[0]?.category ?? null,
      maxPriceMinor: i.maxPriceMinor,
      lowestListingMinor: p2p.length ? Math.min(...p2p) : null,
      listings: p2p.length,
      dropPriceMinor: drop?.askingPriceMinor ?? null,
    };
  });
}

async function watchers(playerId: string) {
  return db.watchItem.findMany({ where: { playerId } });
}

/** A manager listed a card: tell the player's watchers (respecting their alert price). */
export async function alertNewListing(listing: { id: string; sellerId: string | null; askingPriceMinor: number; playerId: string; playerName: string }) {
  const list = await watchers(listing.playerId);
  const n = list.length;
  for (const w of list) {
    if (w.userId === listing.sellerId) continue;
    if (w.maxPriceMinor != null && listing.askingPriceMinor > w.maxPriceMinor) continue;
    await notify(w.userId, {
      kind: "listing",
      title: `${listing.playerName} listed for ${fmtMp(listing.askingPriceMinor)}`,
      body: (w.maxPriceMinor != null ? `At or under your alert price of ${fmtMp(w.maxPriceMinor)}.` : "A player on your watchlist is on the Transfer list.") + watching(n),
      href: "/transfers",
      dedupeKey: `listing:${listing.id}:${w.userId}`,
    });
  }
}

/** A player changed tier: tell their watchers. */
export async function alertTierChange(playerId: string, to: string) {
  const p = await db.player.findUnique({ where: { id: playerId }, select: { displayName: true } });
  const day = new Date().toISOString().slice(0, 10);
  for (const w of await watchers(playerId)) {
    await notify(w.userId, {
      kind: "tier",
      title: `${p?.displayName ?? "A watched player"} is now ${to[0] + to.slice(1).toLowerCase()}`,
      body: "Their value moved them to a new tier — every copy of their card changed with them.",
      href: `/players/${playerId}`,
      dedupeKey: `tier:${playerId}:${to}:${day}:${w.userId}`,
    });
  }
}

/** Drops that have gone live: tell watchers once. Safe to run repeatedly. */
export async function announceLiveDrops(now = new Date()) {
  const live = await db.marketListing.findMany({
    where: { house: true, status: "ACTIVE", liveAt: { lte: now, gt: new Date(now.getTime() - 7 * 86_400_000) }, card: { packable: false } },
    select: { id: true, askingPriceMinor: true, card: { select: { template: { select: { playerId: true, player: { select: { displayName: true } } } } } } },
  });
  let sent = 0;
  for (const l of live) {
    const list = await watchers(l.card.template.playerId);
    const n = list.length;
    for (const w of list) {
      await notify(w.userId, {
        kind: "drop",
        title: `${l.card.template.player.displayName} has dropped!`,
        body: `MATCHX released one for ${fmtMp(l.askingPriceMinor)}. First come, first served.${watching(n)}`,
        href: "/transfers/drops",
        dedupeKey: `drop:${l.id}:${w.userId}`,
      });
      sent++;
    }
  }
  return sent;
}

export const VALUE_ALERT_PCT = 10;

/**
 * Value alerts for watched players. The first time a watched player has a value it becomes the
 * baseline (no alert). After that, a move of 10%+ from the baseline (and at least 1 MX) tells the
 * manager — "a buying chance" when it falls — and resets the baseline, so each move is told once.
 */
export async function alertValueMoves() {
  const items = await db.watchItem.findMany({ select: { id: true, userId: true, playerId: true, baselineMp: true } });
  if (!items.length) return 0;
  const players = await db.player.findMany({
    where: { id: { in: [...new Set(items.map((i) => i.playerId))] } },
    select: { id: true, displayName: true, templates: { where: { edition: "STANDARD", active: true }, select: { category: true }, orderBy: { version: "desc" }, take: 1 } },
  });
  const { latestValues } = await import("./valuation");
  const keys = players.flatMap((p) => (p.templates[0] ? [{ playerId: p.id, category: p.templates[0].category }] : []));
  const values = await latestValues(keys);
  const now = new Map(keys.map((k) => [k.playerId, values.get(`${k.playerId}:${k.category}`)]));
  let sent = 0;
  for (const w of items) {
    const v = now.get(w.playerId);
    if (v == null) continue;
    if (w.baselineMp == null || w.baselineMp <= 0) {
      await db.watchItem.update({ where: { id: w.id }, data: { baselineMp: v } });
      continue;
    }
    const diff = v - w.baselineMp;
    const pct = Math.round((diff / w.baselineMp) * 100);
    if (Math.abs(pct) < VALUE_ALERT_PCT || Math.abs(diff) < 1) continue;
    const name = players.find((p) => p.id === w.playerId)?.displayName ?? "A watched player";
    await notify(w.userId, {
      kind: "value",
      title: diff < 0 ? `▼ ${name} down ${Math.abs(pct)}% to ${v} MX` : `▲ ${name} up ${pct}% to ${v} MX`,
      body: diff < 0 ? `Was ${w.baselineMp} MX — a buying chance if you've been waiting.` : `Was ${w.baselineMp} MX. Their value is rising.`,
      href: `/players/${w.playerId}`,
      dedupeKey: `value:${w.id}:${w.baselineMp}:${v}`,
    });
    await db.watchItem.update({ where: { id: w.id }, data: { baselineMp: v } });
    sent++;
  }
  return sent;
}

/** How many managers are watching each player (for "watched by 12 managers" and alert copy). */
export async function watcherCounts(playerIds: string[]) {
  if (!playerIds.length) return new Map<string, number>();
  const rows = await db.watchItem.groupBy({ by: ["playerId"], where: { playerId: { in: [...new Set(playerIds)] } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.playerId, r._count._all]));
}

const watching = (n: number) => (n > 1 ? ` ${n} managers are watching — be quick.` : "");

/**
 * Every other way a watched player comes onto the market, told once each (to the phone too):
 * MATCHX buy-now listings from circulation, house listings and auctions going live. Managers'
 * own listings are told the moment they're made (alertNewListing, same key, so never twice) and
 * player drops by announceLiveDrops.
 */
export async function announceWatchedMarket(now = new Date()) {
  const since = new Date(now.getTime() - 2 * 86_400_000);
  const [listings, auctions] = await Promise.all([
    db.marketListing.findMany({
      where: { status: "ACTIVE", expiresAt: { gt: now }, OR: [{ liveAt: null, createdAt: { gte: since } }, { liveAt: { lte: now, gte: since } }], NOT: { house: true, card: { packable: false } } },
      select: { id: true, house: true, sellerId: true, askingPriceMinor: true, card: { select: { template: { select: { playerId: true, player: { select: { displayName: true } } } } } } },
      take: 500,
    }),
    db.auction.findMany({
      where: { status: "LIVE", endsAt: { gt: now }, startsAt: { gte: since, lte: now } },
      select: { id: true, startPriceMinor: true, endsAt: true, card: { select: { template: { select: { playerId: true, player: { select: { displayName: true } } } } } } },
    }),
  ]);
  const ids = [...listings.map((l) => l.card.template.playerId), ...auctions.map((a) => a.card.template.playerId)];
  if (!ids.length) return 0;
  const [items, counts] = await Promise.all([db.watchItem.findMany({ where: { playerId: { in: ids } } }), watcherCounts(ids)]);
  let sent = 0;
  for (const l of listings) {
    const pid = l.card.template.playerId;
    for (const w of items.filter((x) => x.playerId === pid)) {
      if (w.userId === l.sellerId) continue;
      if (w.maxPriceMinor != null && l.askingPriceMinor > w.maxPriceMinor) continue;
      await notify(w.userId, {
        kind: "listing",
        title: `👀 ${l.card.template.player.displayName} is available — ${fmtMp(l.askingPriceMinor)}`,
        body: `${l.house ? "MATCHX has one on buy now." : "A manager has listed one on the Transfer list."}${watching(counts.get(pid) ?? 0)}`,
        href: "/transfers",
        dedupeKey: `listing:${l.id}:${w.userId}`,
      });
      sent++;
    }
  }
  for (const a of auctions) {
    const pid = a.card.template.playerId;
    for (const w of items.filter((x) => x.playerId === pid)) {
      await notify(w.userId, {
        kind: "listing",
        title: `🔨 ${a.card.template.player.displayName} is up for auction`,
        body: `Bidding starts at ${fmtMp(a.startPriceMinor)}.${watching(counts.get(pid) ?? 0)}`,
        href: "/transfers/auctions",
        dedupeKey: `auction:${a.id}:${w.userId}`,
      });
      sent++;
    }
  }
  return sent;
}
