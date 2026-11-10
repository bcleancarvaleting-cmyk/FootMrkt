"use client";

import { useActionState, useState } from "react";
import { makeOfferAction, placeBidAction } from "@/app/actions/transfers";
import { ResultText } from "./action-button";

const mp = (minor: number) => (minor / 100).toFixed(2);

/** "Offer" button that opens a small inline form. MP is held when the offer is sent. */
export function OfferButton({ listingId, askMinor, enabled, existing }: { listingId: string; askMinor: number; enabled: boolean; existing?: number | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(makeOfferAction, null);
  if (!open) {
    return (
      <span className="flex flex-col items-end gap-1">
        <button type="button" className="btn-ghost px-3 py-2 text-[11px]" disabled={!enabled} onClick={() => setOpen(true)}>
          {existing ? "Change offer" : "Offer"}
        </button>
        {existing ? <span className="text-[10px] text-faint">Yours: {mp(existing)} MP</span> : null}
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
          aria-label="Offer in MP"
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
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="auctionId" value={auctionId} />
      <span className="flex items-center gap-1">
        <input name="amount" type="number" step="0.01" min={mp(minMinor)} max="100" defaultValue={mp(minMinor)} className="input w-24 py-2 text-right tabular-nums" aria-label="Bid in MP" required disabled={!enabled} />
        <button className="btn-primary px-3 py-2 text-[11px]" disabled={pending || !enabled}>
          {pending ? "…" : "Bid"}
        </button>
      </span>
      {state && <ResultText result={state} />}
    </form>
  );
}
