import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { PlayerCard } from "@/components/player-card";
import { AuctionBuyNowButton, BidForm } from "@/components/transfer-forms";
import { requireUser } from "@/server/auth/session";
import { allFlags } from "@/server/flags";
import { auctionBoard } from "@/server/transfers-view";

export const metadata = { title: "Auctions" };

/** Live auctions: MATCHX's and managers' own (3, 12 or 24 hours, some with a buy-it-now price). */
export default async function AuctionsPage() {
  const user = await requireUser();
  const [board, flags] = await Promise.all([auctionBoard(user.id), allFlags()]);
  const on = flags.MARKET && flags.AUCTIONS;
  const live = board.filter((a) => a.live);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-4xl">Auctions</h1>
        <p className="text-sm text-muted">
          The highest bid when the clock runs out wins. Some sellers set a <b className="text-gold">buy-it-now</b> price, so you can take the player straight away. Your MX is held while you lead and returned if you&apos;re outbid. To auction one of your own players, open it in{" "}
          <Link href="/account/club" className="text-lime underline">My Club</Link> and choose &ldquo;auction it&rdquo;.
        </p>
        {!on && <p className="mt-2 text-sm text-warn">Auctions open once our UK legal and payment checks are complete.</p>}
      </div>
      {live.length ? (
        <ul className="space-y-3">
          {live.map((a) => (
            <li key={a.id} className="panel flex flex-wrap items-center gap-4 p-3">
              <Link href={`/cards/${a.card.id}`} className="shrink-0">
                <PlayerCard card={a.card} size="sm" />
              </Link>
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <p className="font-display text-xl font-bold uppercase italic leading-tight">{a.card.name}</p>
                <p className="text-xs text-muted">
                  {a.card.clubName} · {a.card.leagueName} · sold by <b className="text-fg">{a.seller ?? "MATCHX"}</b>
                  {a.mine && <span className="ml-1 text-lime">(you)</span>}
                </p>
                <p>
                  {a.leadingMinor !== null ? (
                    <>
                      Top bid <b className="text-lime">{(a.leadingMinor / 100).toFixed(2)} MX</b> · {a.youLead ? <span className="text-mint">you lead</span> : a.leader}
                    </>
                  ) : (
                    <>Starting bid <b>{(a.minNextMinor / 100).toFixed(2)} MX</b> · no bids yet</>
                  )}
                </p>
                {!a.reserveMet && <p className="text-xs font-semibold text-warn">Minimum price not reached yet</p>}
                <p className="text-xs text-faint">
                  Ends in <Countdown to={a.endsAt.toISOString()} className="font-bold text-fg" /> · {a.bids} bid{a.bids === 1 ? "" : "s"}
                </p>
              </div>
              {!a.mine && (
                <div className="flex flex-col items-end gap-2">
                  <BidForm auctionId={a.id} minMinor={a.minNextMinor} enabled={on} />
                  {a.buyNowMinor !== null && <AuctionBuyNowButton auctionId={a.id} priceMinor={a.buyNowMinor} enabled={on} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel p-6 text-sm text-muted">No auctions running right now. Put one of your own players up from My Club, or check back soon.</div>
      )}
    </div>
  );
}
