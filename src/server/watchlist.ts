import { db } from "./db";
import { DomainError } from "./errors";
import { notify } from "./notifications";
import { fmtMp } from "./wallet";

/**
 * Watchlist and alerts. Managers follow players and are told (in-app notifications) when:
 *  - MATCHX drops one of them (once the drop goes live),
 *  - another manager lists one on the Transfer list — at or under their alert price, if they set one,
 *  - the player changes tier (e.g. Bronze → Gold) after a value update.
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
  for (const w of await watchers(listing.playerId)) {
    if (w.userId === listing.sellerId) continue;
    if (w.maxPriceMinor != null && listing.askingPriceMinor > w.maxPriceMinor) continue;
    await notify(w.userId, {
      kind: "listing",
      title: `${listing.playerName} listed for ${fmtMp(listing.askingPriceMinor)}`,
      body: w.maxPriceMinor != null ? `At or under your alert price of ${fmtMp(w.maxPriceMinor)}.` : "A player on your watchlist is on the Transfer list.",
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
    for (const w of await watchers(l.card.template.playerId)) {
      await notify(w.userId, {
        kind: "drop",
        title: `${l.card.template.player.displayName} has dropped!`,
        body: `MATCHX released one for ${fmtMp(l.askingPriceMinor)}. First come, first served.`,
        href: "/transfers/drops",
        dedupeKey: `drop:${l.id}:${w.userId}`,
      });
      sent++;
    }
  }
  return sent;
}
