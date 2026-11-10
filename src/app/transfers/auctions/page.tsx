import { CardRow, RowStat, Sparkline } from "@/components/card-row";
import { Countdown } from "@/components/countdown";
import { EmptyState, GateNotice, PageHeader } from "@/components/page-header";
import { BidForm } from "@/components/transfer-forms";
import { requireUser } from "@/server/auth/session";
import { isEnabled } from "@/server/flags";
import { auctionBoard, recentAuctionResults } from "@/server/transfers-view";
import { fmtMp } from "@/server/wallet";
import { relativeTime } from "@/lib/view";

export const metadata = { title: "Auctions" };

export default async function AuctionsPage() {
  const user = await requireUser();
  const [market, auctionsOn, auctions, results] = await Promise.all([isEnabled("MARKET"), isEnabled("AUCTIONS"), auctionBoard(user.id), recentAuctionResults()]);
  const open = market && auctionsOn;
  if (!auctionsOn) {
    return (
      <div>
        <PageHeader eyebrow="Run by MATCHX" title="Auctions" />
        <div className="rounded-2xl border border-accent/40 bg-ink-900 px-6 py-12 text-center">
          <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-accent-ink">Coming soon</span>
          <p className="mt-4 font-display text-3xl font-bold uppercase italic">House auctions</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            We&apos;ll release cards straight into the community here: highest bid when the clock hits zero wins. Auctions open after the beta.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        eyebrow="Run by MATCHX"
        title="Auctions"
        intro="We release cards straight into the community here. Highest bid when the clock hits zero wins. A bid in the last 2 minutes adds 2 more, so nobody gets sniped."
      />
      {!market && <GateNotice>Bidding opens with Transfers.</GateNotice>}

      {auctions.length === 0 ? (
        <EmptyState title="No live auctions">New auctions are announced in chat and on the Home page. Check back soon.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {auctions.map((a) => (
            <CardRow
              key={a.id}
              card={a.card}
              sub={<span className="truncate text-faint">· #{a.card.serial}{a.card.maxSupply ? `/${a.card.maxSupply}` : ""}</span>}
            >
              <span className="hidden w-24 justify-center lg:flex">
                <Sparkline points={a.history} />
              </span>
              <RowStat label={a.live ? "Ends in" : "Starts in"} className="w-24">
                <Countdown to={(a.live ? a.endsAt : a.startsAt).toISOString()} className={a.live ? "text-lime" : ""} />
              </RowStat>
              <RowStat label={a.leadingMinor ? "Top bid" : "Start"} className="hidden w-28 sm:block">
                {a.leadingMinor ? fmtMp(a.leadingMinor) : fmtMp(a.minNextMinor)}
                <span className="block text-[10px] font-normal text-faint">
                  {a.youLead ? <span className="text-mint">You&apos;re leading</span> : a.leader ? `${a.leader} · ${a.bids} bid${a.bids > 1 ? "s" : ""}` : "No bids yet"}
                  {!a.reserveMet && " · reserve not met"}
                </span>
              </RowStat>
              <BidForm auctionId={a.id} minMinor={a.minNextMinor} enabled={open && a.live && !a.youLead} />
            </CardRow>
          ))}
        </ul>
      )}

      {results.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-2xl">Recent results</h2>
          <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900">
            {results.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{r.card.template.player.displayName}</span>
                  <span className="text-faint"> · {r.card.template.category.toLowerCase()} · won by {r.winner?.displayName ?? "—"}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {r.winningBidMinor ? fmtMp(r.winningBidMinor) : "—"} <span className="text-faint">· {r.settledAt ? relativeTime(r.settledAt) : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
