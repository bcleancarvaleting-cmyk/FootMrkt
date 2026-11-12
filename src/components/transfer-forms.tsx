"use client";

import { useActionState, useState, useTransition } from "react";
import { buyNowAuctionAction, counterOfferAction, makeOfferAction, placeBidAction } from "@/app/actions/transfers";
import type { ActionResult } from "@/app/actions/result";
import { ResultText } from "./action-button";

const mp = (minor: number) => (minor / 100).toFixed(2);

/** "Offer" button that opens a small inline form. MX is held when the offer is sent. */
export function OfferButton({ listingId, askMinor, enabled, existing }: { listingId: string; askMinor: number; enabled: boolean; existing?: number | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(makeOfferAction, null);
  if (!open) {
    return (
      <span className="flex flex-col items-end gap-1">
        <button type="button" className="btn-ghost px-3 py-2 text-[11px]" disabled={!enabled} onClick={() => setOpen(true)}>
          {existing ? "Change offer" : "Offer"}
        </button>
        {existing ? <span className="text-[10px] text-faint">Yours: £{mp(existing)}</span> : null}
      </span>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="listingId" value={listingId} />
      <span className="flex items-center gap-1">
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0.10"
          max={mp(askMinor - 1)}
          defaultValue={mp(Math.max(10, Math.round(askMinor * 0.9)))}
          className="input w-24 py-2 text-right tabular-nums"
          aria-label="Offer in £"
          required
        />
        <button className="btn-primary px-3 py-2 text-[11px]" disabled={pending}>
          {pending ? "…" : "Send"}
        </button>
        <button type="button" className="px-1 text-xs text-muted hover:text-fg" onClick={() => setOpen(false)} aria-label="Cancel offer">
          ✕
        </button>
      </span>
      {state && <ResultText result={state} />}
    </form>
  );
}

export function BidForm({ auctionId, minMinor, enabled }: { auctionId: string; minMinor: number; enabled: boolean }) {
  const [state, action, pending] = useActionState(placeBidAction, null);
  return (
    <form action={action} className="flex max-w-full flex-col items-end gap-1">
      <input type="hidden" name="auctionId" value={auctionId} />
      <span className="flex items-center gap-1">
        <span className="text-[10px] font-bold uppercase text-faint">£</span>
        <input name="amount" type="number" step="0.01" min={mp(minMinor)} defaultValue={mp(minMinor)} className="input w-20 py-2 text-right tabular-nums" aria-label={`Bid in £ (minimum £${mp(minMinor)})`} required disabled={!enabled} />
        <button className="btn-primary px-3 py-2 text-[11px]" disabled={pending || !enabled}>
          {pending ? "…" : "Bid"}
        </button>
      </span>
      {state && <ResultText result={state} />}
    </form>
  );
}

/** Take a manager's auction straight away at its buy-it-now price. */
export function AuctionBuyNowButton({ auctionId, priceMinor, enabled }: { auctionId: string; priceMinor: number; enabled: boolean }) {
  const [res, setRes] = useState<ActionResult<unknown> | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" className="btn-gold px-3 py-2 text-[11px]" disabled={pending || !enabled} onClick={() => start(async () => setRes(await buyNowAuctionAction(auctionId)))}>
        {pending ? "…" : `Buy now £${mp(priceMinor)}`}
      </button>
      {res && <ResultText result={res} exact={{ kind: "auction", id: auctionId }} />}
    </span>
  );
}

/** Seller: reply to an offer with a counter-price (between their offer and your asking price). */
export function CounterOfferForm({ offerId, offerMinor, askMinor, disabled }: { offerId: string; offerMinor: number; askMinor: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(counterOfferAction.bind(null, offerId), null);
  const mid = Math.round((offerMinor + askMinor) / 2) / 100;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={disabled} className="btn-ghost px-3 py-1.5 text-[11px]">
        Counter
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="counter" type="number" step="0.01" min={(offerMinor + 1) / 100} max={(askMinor - 1) / 100} defaultValue={mid.toFixed(2)} className="input w-24 py-1.5 text-sm" aria-label="Counter price in £" />
      <button className="btn-primary px-3 py-1.5 text-[11px]" disabled={pending}>
        {pending ? "…" : "Send counter"}
      </button>
      {state && <ResultText result={state} />}
    </form>
  );
}
