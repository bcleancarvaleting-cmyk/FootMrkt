import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlayerCard } from "@/components/player-card";
import { WatchButton } from "@/components/watch-button";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { cardViews } from "@/server/views";
import { isWatching, watcherCounts } from "@/server/watchlist";

export const metadata = { title: "Find a player" };
export const dynamic = "force-dynamic";

/**
 * "Find this player" from any card: straight to wherever one is on sale now — the MATCHX market,
 * a player drop, the Transfer list or a live auction. If none is for sale, the player is rare: add
 * them to your watchlist and you're told the moment one is available from any seller.
 */
export default async function FindPlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  const user = await requireUser();
  const { playerId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(playerId)) notFound();
  const player = await db.player.findUnique({ where: { id: playerId }, select: { id: true, displayName: true, club: { select: { name: true } } } });
  if (!player) notFound();
  const now = new Date();
  const forPlayer = { template: { playerId } };
  const name = encodeURIComponent(player.displayName);
  const [market, drop, listed, auction] = await Promise.all([
    db.marketListing.findFirst({ where: { house: true, status: "ACTIVE", expiresAt: { gt: now }, OR: [{ liveAt: null }, { liveAt: { lte: now } }], card: { packable: true, ...forPlayer } }, select: { id: true } }),
    db.marketListing.findFirst({ where: { house: true, status: "ACTIVE", expiresAt: { gt: now }, OR: [{ liveAt: null }, { liveAt: { lte: now } }], card: { packable: false, ...forPlayer } }, select: { id: true } }),
    db.marketListing.findFirst({ where: { house: false, status: "ACTIVE", expiresAt: { gt: now }, card: forPlayer }, select: { id: true } }),
    db.auction.findFirst({ where: { status: "LIVE", endsAt: { gt: now }, card: forPlayer }, select: { id: true } }),
  ]);
  if (market) redirect(`/transfers/market?q=${name}`);
  if (drop) redirect(`/transfers/drops`);
  if (listed) redirect(`/transfers?q=${name}`);
  if (auction) redirect(`/transfers/auctions`);

  // Nobody's selling: show the player, why, and the watchlist.
  const [card] = await cardViews({ template: { playerId }, supplyState: "HELD" }, [{ template: { category: "desc" } }], 1);
  const [watching, watchers] = await Promise.all([isWatching(user.id, playerId), watcherCounts([playerId])]);
  const others = Math.max(0, (watchers.get(playerId) ?? 0) - (watching ? 1 : 0));
  return (
    <div className="mx-auto max-w-xl">
      <div className="relative overflow-hidden rounded-3xl border border-gold/50 bg-gradient-to-b from-[#1b1606] to-ink-900 p-6 text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gold">💎 This player is rare</p>
        <h1 className="mt-2 text-4xl leading-none sm:text-5xl">{player.displayName}</h1>
        {player.club && <p className="mt-1 text-sm text-muted">{player.club.name}</p>}
        {card && (
          <div className="mt-5 flex justify-center">
            <PlayerCard card={card} size="md" showcase />
          </div>
        )}
        <p className="mx-auto mt-5 max-w-sm text-sm text-muted">
          No one is selling {player.displayName} right now — not on the MATCHX market, in a player drop, on the Transfer list or at auction.
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm font-semibold">Add them to your watchlist and we&apos;ll tell you the moment one is available to buy from any seller.</p>
        <div className="mt-4 flex justify-center">
          <WatchButton playerId={playerId} initial={watching} big />
        </div>
        {others > 0 && (
          <p className="mt-3 text-xs text-faint">
            👀 {others} other manager{others === 1 ? " is" : "s are"} watching {player.displayName.split(" ").slice(-1)[0]} too — be quick when one lands.
          </p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href="/transfers/market" className="btn-ghost py-3 text-[12px]">Browse the market</Link>
        <Link href={`/players/${playerId}`} className="btn-ghost py-3 text-[12px]">Player stats</Link>
      </div>
    </div>
  );
}
