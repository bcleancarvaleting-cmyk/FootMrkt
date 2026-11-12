"use client";

import { useActionState, useState, useTransition } from "react";
import { setAlertPriceAction, toggleWatchAction } from "@/app/actions/social";

/** Follow a player: alerts when they drop, get listed, or change tier. */
export function WatchButton({ playerId, initial, className = "" }: { playerId: string; initial: boolean; className?: string }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        aria-pressed={on}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await toggleWatchAction(playerId, !on);
            if (r.ok) setOn(!on);
            setMsg(r.ok ? (r.message ?? null) : r.error);
          })
        }
        className={`btn-ghost px-4 py-2 text-xs ${on ? "border-accent text-lime" : ""}`}
      >
        {on ? "👁 Watching" : "👁 Watch player"}
      </button>
      {msg && <span className="text-[11px] text-faint">{msg}</span>}
    </span>
  );
}

/** "Alert me if listed at or under …" price for a watched player. */
export function AlertPriceForm({ playerId, current }: { playerId: string; current: number | null }) {
  const [state, action, pending] = useActionState(setAlertPriceAction.bind(null, playerId), null);
  return (
    <form action={action} className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`alert-${playerId}`}>
        Alert price in MX
      </label>
      <input id={`alert-${playerId}`} name="price" type="number" step="0.01" min="0.10" max="100" defaultValue={current ? (current / 100).toFixed(2) : ""} placeholder="Any price" className="input w-28 py-1.5 text-sm" />
      <button className="btn-ghost px-3 py-1.5 text-[11px]" disabled={pending}>
        Save
      </button>
      {state && <span className={`text-[11px] ${state.ok ? "text-faint" : "text-danger"}`}>{state.ok ? state.message : state.error}</span>}
    </form>
  );
}

/** "👁 Watched by 12 managers" — real watchlist count; shows a nudge when it's popular. */
export function WatchedBy({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-600 bg-ink-900 px-3 py-1.5 text-xs font-semibold">
      <span aria-hidden="true">👁</span> Watched by <b className="tabular-nums text-fg">{count}</b> manager{count === 1 ? "" : "s"}
      {count >= 5 && <span className="text-lime">· in demand</span>}
    </span>
  );
}
