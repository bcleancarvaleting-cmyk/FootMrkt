import { db } from "./db";
import { notify } from "./notifications";

/**
 * Event alerts: each one becomes an in-app notification and, if the manager turned push on, a
 * phone notification too. They're sent after the database work has committed, and a failure never
 * undoes the trade or result it's about.
 */
const DAY = 86_400_000;

type Alert = Parameters<typeof notify>[1];
const send = (userId: string | null | undefined, n: Alert) => (userId ? notify(userId, n).catch(() => {}) : Promise.resolve());

/** "Bukayo Saka (Gold #12)" for a card. */
async function cardName(cardId: string) {
  const c = await db.cardInstance.findUnique({ where: { id: cardId }, select: { serial: true, template: { select: { category: true, player: { select: { displayName: true } } } } } });
  if (!c) return "a player";
  const tier = c.template.category.charAt(0) + c.template.category.slice(1).toLowerCase();
  return `${c.template.player.displayName} (${tier} #${c.serial})`;
}

const mx = (minor: number) => `${(minor / 100).toFixed(2)} MX`;

export const alerts = {
  async cardSold(sellerId: string | null, cardId: string, priceMinor: number, listingId: string) {
    await send(sellerId, { kind: "MARKET", title: "💸 Player sold", body: `${await cardName(cardId)} sold for ${mx(priceMinor)}. The money's in your wallet.`, href: "/account/wallet", dedupeKey: `sold:${listingId}` });
  },
  async offerReceived(sellerId: string | null, cardId: string, amountMinor: number, offerId: string) {
    await send(sellerId, { kind: "MARKET", title: "📩 New offer", body: `${mx(amountMinor)} offered for ${await cardName(cardId)}. Accept or decline on Transfers.`, href: "/transfers/mine", dedupeKey: `offer:${offerId}` });
  },
  async offerAnswered(buyerId: string, cardId: string, accepted: boolean, offerId: string) {
    const name = await cardName(cardId);
    await send(
      buyerId,
      accepted
        ? { kind: "NEW_PLAYER", title: "✍️ New signing!", body: `Your offer was accepted — ${name} has joined your club.`, href: `/cards/${cardId}`, dedupeKey: `offer:${offerId}:answer` }
        : { kind: "MARKET", title: "Offer declined", body: `Your offer for ${name} was declined. Your MX is back in your wallet.`, href: "/transfers/mine", dedupeKey: `offer:${offerId}:answer` },
    );
  },
  async outbid(userId: string, cardId: string, auctionId: string, bidId: string) {
    await send(userId, { kind: "AUCTION", title: "⚠️ You've been outbid", body: `Someone bid more for ${await cardName(cardId)}. Your MX is back — bid again before it ends.`, href: "/transfers/auctions", dedupeKey: `outbid:${bidId}` });
  },
  async auctionWon(userId: string, cardId: string, amountMinor: number, auctionId: string) {
    await send(userId, { kind: "AUCTION", title: "🔨 Auction won!", body: `${await cardName(cardId)} is yours for ${mx(amountMinor)}.`, href: `/cards/${cardId}`, dedupeKey: `auction:${auctionId}:won` });
  },
  async packReady(userId: string, packName: string, ref: string) {
    await send(userId, { kind: "PACK", title: `🎁 ${packName} is ready`, body: "A free pack is waiting for you — open it on Packs.", href: "/packs", dedupeKey: `pack:${ref}` });
  },
};

/** A free gift drop has gone live: tell managers who've played in the last 30 days (once per drop). */
export async function announceGiftDrops(now = new Date()) {
  const drop = await db.freePackDrop.findFirst({ where: { startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { startsAt: "desc" } });
  if (!drop) return 0;
  if (await db.notification.findFirst({ where: { dedupeKey: { startsWith: `giftdrop:${drop.id}:` } }, select: { id: true } })) return 0;
  const since = new Date(now.getTime() - 30 * DAY);
  const users = await db.user.findMany({ where: { status: "ACTIVE", OR: [{ lastSeenAt: { gte: since } }, { createdAt: { gte: since } }] }, select: { id: true } });
  const hours = Math.max(1, Math.round((drop.endsAt.getTime() - now.getTime()) / 3_600_000));
  for (const u of users) {
    await send(u.id, { kind: "DROP", title: `🎁 Free gift: ${drop.title}`, body: `Claim it on Packs — it's gone in ${hours} hours.`, href: "/packs", dedupeKey: `giftdrop:${drop.id}:${u.id}` });
  }
  return users.length;
}

/**
 * Mini-league gameweek winners: once a gameweek settles, the top scorer in every private league
 * (at least two members played) is told they won the week. Ties all win.
 */
export async function announceLeagueWinners(now = new Date()) {
  const settled = await db.gameweek.findMany({ where: { status: "SETTLED", endsAt: { gte: new Date(now.getTime() - 7 * DAY) } }, select: { id: true, number: true } });
  let sent = 0;
  for (const gw of settled) {
    const entries = await db.competitionEntry.findMany({
      where: { status: "ACTIVE", finalPoints: { not: null }, competition: { gameweekId: gw.id, status: "SETTLED" } },
      select: { userId: true, finalPoints: true },
    });
    if (!entries.length) continue;
    const best = new Map<string, number>();
    for (const e of entries) best.set(e.userId, Math.max(best.get(e.userId) ?? -Infinity, Number(e.finalPoints)));
    const leagues = await db.miniLeague.findMany({ where: { members: { some: { userId: { in: [...best.keys()] } } } }, select: { id: true, name: true, members: { select: { userId: true } } } });
    for (const l of leagues) {
      const played = l.members.filter((m) => best.has(m.userId));
      if (played.length < 2) continue;
      const top = Math.max(...played.map((m) => best.get(m.userId)!));
      for (const m of played.filter((p) => best.get(p.userId) === top)) {
        await send(m.userId, { kind: "LEAGUE", title: `🏆 You won GW${gw.number} in ${l.name}`, body: `Top of your mini-league this week with ${top} pts.`, href: `/leagues/${l.id}`, dedupeKey: `league:${l.id}:gw:${gw.id}:${m.userId}` });
        sent++;
      }
    }
  }
  return sent;
}
