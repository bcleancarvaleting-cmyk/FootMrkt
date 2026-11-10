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
}: {
  cardId: string;
  guidance: { recommendedMinor: number; avgMinor: number | null; sales: number };
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(createListingAction, null);
  const [price, setPrice] = useState(mp(guidance.recommendedMinor));
  const minor = Math.round(Number(price) * 100) || 0;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="cardId" value={cardId} />
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => setPrice(mp(guidance.recommendedMinor))} className="chip border-accent/50 px-3 py-1.5 text-fg">
          Recommended {mp(guidance.recommendedMinor)} MP
        </button>
        {guidance.avgMinor !== null && (
          <span className="chip px-3 py-1.5">
            Avg sold {mp(guidance.avgMinor)} MP · {guidance.sales} sale{guidance.sales === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="price">Buy-now price (MP)</label>
          <input id="price" className="input tabular-nums" name="price" type="number" min="0.10" max="100" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
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
        If it sells you get <b className="text-fg">{mp(Math.max(0, minor - (minor ? fee(minor) : 0)))} MP</b> (5% fee {minor ? mp(fee(minor)) : "0.00"} MP). Max price 100 MP. Buyers can also send you offers.
      </p>
      <button className="btn-primary" disabled={pending || !enabled}>
        {pending ? "Listing…" : "List on Transfers"}
      </button>
      {state && <ResultText result={state} />}
    </form>
  );
}
