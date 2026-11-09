"use client";

import { useActionState } from "react";
import { createListingAction } from "@/app/actions/game";
import { ResultText } from "./action-button";

export function ListingForm({ cardId }: { cardId: string }) {
  const [state, action, pending] = useActionState(createListingAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="cardId" value={cardId} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Asking price (£)</label>
          <input className="input" name="price" type="number" min="0.01" step="0.01" required />
        </div>
        <div>
          <label className="label">Duration</label>
          <select className="input" name="days" defaultValue="7">
            {[1, 3, 7, 14].map((d) => (
              <option key={d} value={d}>
                {d} day{d > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-faint">Your asking price is separate from the card&apos;s indicative MP value. There is no guarantee it will sell.</p>
      <button className="btn-primary" disabled={pending}>
        {pending ? "Listing…" : "List on Transfer Market"}
      </button>
      {state && <ResultText result={state} />}
    </form>
  );
}
