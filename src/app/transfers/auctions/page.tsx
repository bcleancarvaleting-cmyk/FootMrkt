import Link from "next/link";
import { AuctionSync } from "@/components/auction-sync";
import { Countdown } from "@/components/countdown";
import { TradeRow } from "@/components/trade-row";
import { AuctionBuyNowButton, BidForm } from "@/components/transfer-forms";
import { requireUser } from "@/server/auth/session";
import { allFlags } from "@/server/flags";
import { auctionBoard } from "@/server/transfers-view";

export const metadata = { title: "Auctions" };

/** Live auctions as trading bars, two per row on wide screens. Bids and clocks refresh by themselves. */
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
          Highest bid wins. A bid in the last 30s adds 30s. Sell yours from <Link href="/account/club" className="text-lime underline">My Club</Link>.
        </p>
        {!on && <p className="mt-1 text-sm text-warn">Opening soon.</p>}
      </div>
      <AuctionSync endsAt={live.map((a) => a.endsAt.toISOString())} />
      {live.length ? (
        <ul className="grid gap-1.5 lg:grid-cols-2">
          {live.map((a) => (
            <TradeRow
              key={a.id}
              card={a.card}
              href={`/cards/${a.card.id}`}
              priceLabel={a.leadingMinor !== null ? "Top bid" : "Start"}
              priceMinor={a.leadingMinor ?? a.minNextMinor}
              seller={
                <>
                  Sold by <b className="text-fg">{a.sellerClub}</b>
                  {a.mine && <span className="text-lime"> (you)</span>}
                </>
              }
              extra={
                <>
                  <b className="text-fg">{a.bids}</b> bid{a.bids === 1 ? "" : "s"}
                  {a.youLead && <span className="font-bold text-mint"> · you lead</span>}
                  {!a.reserveMet && <span className="text-warn"> · reserve not met</span>} ·{" "}
                  <Countdown to={a.endsAt.toISOString()} className="font-bold text-fg" urgentClassName="font-bold text-danger" urgentMs={30_000} />
                </>
              }
              actions={
                a.mine ? (
                  <span className="rounded-full border border-white/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-muted">Your auction</span>
                ) : (
                  <>
                    {a.buyNowMinor !== null && <AuctionBuyNowButton auctionId={a.id} priceMinor={a.buyNowMinor} enabled={on} />}
                    <BidForm auctionId={a.id} minMinor={a.minNextMinor} enabled={on} />
                  </>
                )
              }
            />
          ))}
        </ul>
      ) : (
        <div className="panel p-6 text-sm text-muted">No auctions live. Put one of your players up from My Club.</div>
      )}
    </div>
  );
}
