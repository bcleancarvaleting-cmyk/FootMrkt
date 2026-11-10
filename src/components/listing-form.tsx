"use client";

import { useActionState, useState } from "react";
import { createListingAction } from "@/app/actions/transfers";
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
          This is a <b className="text-fg">{finishLabel}</b>, so you set the price: it&apos;s worth whatever a manager will pay. Up to {(maxMinor / 100).toLocaleString("en-GB")} MX.
        </p>
      ) : (
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => setPrice(mp(guidance.recommendedMinor))} className="chip border-accent/50 px-3 py-1.5 text-fg">
          Recommended {mp(guidance.recommendedMinor)} MX
        </button>
        {guidance.avgMinor !== null && (
          <span className="chip px-3 py-1.5">
            Avg sold {mp(guidance.avgMinor)} MX · {guidance.sales} sale{guidance.sales === 1 ? "" : "s"}
          </span>
        )}
      </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="price">Buy-now price (MX)</label>
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
        If it sells you get <b className="text-fg">{mp(Math.max(0, minor - (minor ? fee(minor) : 0)))} MX</b> (5% fee {minor ? mp(fee(minor)) : "0.00"} MX). Max price {(maxMinor / 100).toLocaleString("en-GB")} MX. Buyers can also send you offers.
      </p>
      <button className="btn-primary" disabled={pending || !enabled}>
        {pending ? "Listing…" : "List on Transfers"}
      </button>
      {state && <ResultText result={state} />}
    </form>
  );
}
