import Link from "next/link";
import { cancelListingAction, respondToOfferAction, withdrawOfferAction } from "@/app/actions/transfers";
import { ActionButton } from "@/components/action-button";
import { CardRow, RowStat } from "@/components/card-row";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { isEnabled } from "@/server/flags";
import { feeFor } from "@/server/transfers";
import { myTransfers } from "@/server/transfers-view";
import { fmtMp } from "@/server/wallet";
import { relativeTime } from "@/lib/view";

export const metadata = { title: "My transfers" };

const OFFER_TONE: Record<string, string> = { PENDING: "text-warn", ACCEPTED: "text-mint", DECLINED: "text-danger", WITHDRAWN: "text-faint", LAPSED: "text-faint" };

export default async function MyTransfersPage() {
  const user = await requireUser();
  const [open, mine] = await Promise.all([isEnabled("MARKET"), myTransfers(user.id)]);
  return (
    <div className="space-y-10">
      <section>
        <PageHeader eyebrow="Selling" title="My listings" intro="Offers hold the buyer's MX, so accepting one completes the sale instantly. You receive the price minus the 5% fee.">
          <Link href="/account/club" className="btn-ghost px-4 py-2 text-xs">
            List a card
          </Link>
        </PageHeader>
        {mine.listings.length === 0 ? (
          <EmptyState title="Nothing listed">Open any tradeable card in My Club and choose “List on Transfers”.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {mine.listings.map((l) => (
              <div key={l.id} className="space-y-1">
                <CardRow card={l.card} href={`/cards/${l.card.id}`} sub={<span className="text-faint">· expires {relativeTime(l.expiresAt)}</span>}>
                  <RowStat label="Asking" className="w-24">
                    {fmtMp(l.priceMinor)}
                    <span className="block text-[10px] font-normal text-faint">you get {fmtMp(l.priceMinor - feeFor(l.priceMinor))}</span>
                  </RowStat>
                  <ActionButton action={cancelListingAction.bind(null, l.id, l.card.id)} className="btn-ghost px-3 py-2 text-[11px]" disabled={!open}>
                    Remove
                  </ActionButton>
                </CardRow>
                {l.offerList.map((o) => (
                  <div key={o.id} className="ml-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-850 px-4 py-2 text-sm">
                    <span>
                      <span className="font-semibold">{o.buyer.displayName}</span> offered <span className="font-bold tabular-nums">{fmtMp(o.amountMinor)}</span>
                      <span className="text-faint"> · {relativeTime(o.createdAt)} · you&apos;d get {fmtMp(o.amountMinor - feeFor(o.amountMinor))}</span>
                    </span>
                    <span className="flex gap-2">
                      <ActionButton action={respondToOfferAction.bind(null, o.id, false)} className="btn-ghost px-3 py-1.5 text-[11px]" disabled={!open}>
                        Decline
                      </ActionButton>
                      <ActionButton action={respondToOfferAction.bind(null, o.id, true)} className="btn-primary px-3 py-1.5 text-[11px]" disabled={!open} confirm={`Accept ${fmtMp(o.amountMinor)}?`}>
                        Accept
                      </ActionButton>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-3xl">My offers</h2>
        {mine.offers.length === 0 ? (
          <p className="text-sm text-muted">You haven&apos;t made any offers.</p>
        ) : (
          <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900">
            {mine.offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">{o.listing.card.template.player.displayName}</span>
                  <span className="text-faint"> · from {o.listing.seller?.displayName ?? "MATCHX"} · asking {fmtMp(o.listing.askingPriceMinor)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-bold tabular-nums">{fmtMp(o.amountMinor)}</span>
                  <span className={`text-xs font-bold uppercase tracking-wider ${OFFER_TONE[o.status]}`}>{o.status.toLowerCase()}</span>
                  {o.status === "PENDING" && (
                    <ActionButton action={withdrawOfferAction.bind(null, o.id)} className="btn-ghost px-3 py-1.5 text-[11px]" disabled={!open}>
                      Withdraw
                    </ActionButton>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-3xl">History</h2>
        {mine.history.length === 0 ? (
          <p className="text-sm text-muted">No completed transfers yet.</p>
        ) : (
          <ul className="divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900">
            {mine.history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className={`mr-2 text-[10px] font-extrabold tracking-[0.14em] ${h.side === "SOLD" ? "text-mint" : "text-lime"}`}>{h.side}</span>
                  <span className="font-semibold">{h.card.template.player.displayName}</span>
                  <span className="text-faint"> · {h.side === "SOLD" ? `to ${h.buyer?.displayName}` : `from ${h.seller?.displayName ?? "MATCHX"}`}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {h.side === "SOLD" ? "+" : "−"}
                  {fmtMp(h.net)}
                  {h.side === "SOLD" && h.feeMinor ? <span className="text-faint"> (fee {fmtMp(h.feeMinor)})</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
