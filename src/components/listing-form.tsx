"use client";

import { useActionState, useState } from "react";
import { createAuctionListingAction, createListingAction } from "@/app/actions/transfers";
import { ResultText } from "./action-button";

const FEE_BPS = 500;
const fee = (minor: number) => Math.max(1, Math.round((minor * FEE_BPS) / 10_000));
const mp = (minor: number) => (minor / 100).toFixed(2);

export function ListingForm({
  cardId,
  guidance,
  enabled,
  maxMinor = 10_000,
  finishLabel = null,
}: {
  cardId: string;
  guidance: { recommendedMinor: number; avgMinor: number | null; sales: number };
  enabled: boolean;
  /** Ceiling for this card: 100 MX normally, more for Ruby / Diamond / Rainbow. */
  maxMinor?: number;
  /** "Rainbow", "Diamond" or "Ruby" — these are priced by the seller, so no recommended price. */
  finishLabel?: string | null;
}) {
  const [state, action, pending] = useActionState(createListingAction, null);
  const [price, setPrice] = useState(finishLabel ? "" : mp(guidance.recommendedMinor));
  const minor = Math.round(Number(price) * 100) || 0;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="cardId" value={cardId} />
      {finishLabel ? (
        <p className="rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-xs text-muted">
          This is a <b className="text-fg">{finishLabel}</b>, so you set the price: it&apos;s worth whatever a manager will pay. Up to £{(maxMinor / 100).toLocaleString("en-GB")}.
        </p>
      ) : (
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => setPrice(mp(guidance.recommendedMinor))} className="chip border-accent/50 px-3 py-1.5 text-fg">
          Recommended £{mp(guidance.recommendedMinor)}
        </button>
        {guidance.avgMinor !== null && (
          <span className="chip px-3 py-1.5">
            Avg sold £{mp(guidance.avgMinor)} · {guidance.sales} sale{guidance.sales === 1 ? "" : "s"}
          </span>
        )}
      </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="price">Buy-now price (£)</label>
          <input id="price" className="input tabular-nums" name="price" type="number" min="0.10" max={maxMinor / 100} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="days">Listed for</label>
          <select id="days" className="input" name="days" defaultValue="7">
            {[1, 3, 7, 14].map((d) => (
              <option key={d} value={d}>
                {d} day{d > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted">
        If it sells you get <b className="text-fg">£{mp(Math.max(0, minor - (minor ? fee(minor) : 0)))}</b> (5% fee £{minor ? mp(fee(minor)) : "0.00"}). Max price £{(maxMinor / 100).toLocaleString("en-GB")}. Buyers can also send you offers.
      </p>
      {state && !state.ok && /I'm sure/.test(state.error) && (
        <label className="flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
          <input type="checkbox" name="confirmHigh" className="accent-lime" /> I&apos;m sure — list it at this price
        </label>
      )}
      <button className="btn-primary" disabled={pending || !enabled}>
        {pending ? "Listing…" : "List on Transfers"}
      </button>
      {state && <ResultText result={state} />}
    </form>
  );
}

/** Sell as an auction: a starting price, an optional buy-it-now price, and 3, 12 or 24 hours. */
export function AuctionListForm({ cardId, enabled, maxMinor = 10_000, suggestedMinor }: { cardId: string; enabled: boolean; maxMinor?: number; suggestedMinor: number }) {
  const [state, action, pending] = useActionState(createAuctionListingAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="cardId" value={cardId} />
      <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
        <b>Auctions are a risk.</b> Your player sells to the highest bid when the time runs out, and that may be less than you hoped or less than
        they&apos;re worth. Set a <b>minimum price</b> and they won&apos;t sell below it: if bidding doesn&apos;t reach it, they come back to you.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="a-start">Starting bid (£)</label>
          <input id="a-start" className="input tabular-nums" name="start" type="number" min="0.10" max={maxMinor / 100} step="0.01" defaultValue={mp(Math.max(10, Math.round(suggestedMinor * 0.6)))} required />
        </div>
        <div>
          <label className="label" htmlFor="a-reserve">Minimum you&apos;ll accept (£, optional)</label>
          <input id="a-reserve" className="input tabular-nums" name="reserve" type="number" min="0.10" max={maxMinor / 100} step="0.01" placeholder="No minimum" />
        </div>
        <div>
          <label className="label" htmlFor="a-buynow">Buy it now (£, optional)</label>
          <input id="a-buynow" className="input tabular-nums" name="buyNow" type="number" min="0.11" max={maxMinor / 100} step="0.01" placeholder={mp(suggestedMinor)} />
        </div>
        <div>
          <label className="label" htmlFor="a-hours">Runs for</label>
          <select id="a-hours" className="input" name="hours" defaultValue="24">
            <option value="3">3 hours</option>
            <option value="12">12 hours</option>
            <option value="24">24 hours</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted">
        The highest bid at or above your minimum wins when the time runs out, or anyone can take the player straight away at your buy-it-now price. Bidders see whether
        your minimum has been reached, not the amount. You&apos;re paid in bonus credit, minus the 5% fee. <b>Once started, an auction can&apos;t be cancelled</b>: it runs until it sells or the time runs out.
      </p>
      <button className="btn-gold" disabled={pending || !enabled}>
        {pending ? "Starting…" : "Start auction"}
      </button>
      {state && <ResultText result={state} />}
    </form>
  );
}
