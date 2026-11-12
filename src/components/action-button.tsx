"use client";

import { MX_BUNDLES, bonusPct, bundleForShortfall } from "@/config/bundles";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions/result";

/** Calls a (bound) server action and shows its result inline. */
export function ActionButton({
  action,
  children,
  className = "btn-ghost",
  confirm,
  disabled,
}: {
  action: () => Promise<ActionResult<unknown>>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={className}
        disabled={pending || disabled}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setResult(await action()));
        }}
      >
        {pending ? "Working…" : children}
      </button>
      {result && <ResultText result={result} />}
    </span>
  );
}

export function ResultText({ result }: { result: ActionResult<unknown> }) {
  if (result.ok) return result.message ? <span className="text-xs text-mint">{result.message}</span> : null;
  // Not enough money: pop up "Add funds to buy" with one tap to the top-up bundles.
  if (result.code === "INSUFFICIENT_FUNDS" || result.code === "EARNED_ONLY") return <AddFundsPopup message={result.error} shortMinor={result.shortMinor ?? 0} />;
  return (
    <span className="text-xs text-danger">
      {result.error}
      {result.issues && result.issues.length > 1 && (
        <ul className="mt-1 list-disc pl-4">
          {result.issues.map((i, k) => (
            <li key={k}>{i.message}</li>
          ))}
        </ul>
      )}
    </span>
  );
}

/**
 * "Add funds to buy": a bottom sheet over the page when a purchase, bid or offer needs more money,
 * with the same top-up bundles as everywhere else — the smallest one that covers it highlighted.
 */
function AddFundsPopup({ message, shortMinor }: { message: string; shortMinor: number }) {
  const [open, setOpen] = useState(true);
  if (!open) return <span className="text-xs text-danger">{message}</span>;
  const best = bundleForShortfall(Math.max(1, shortMinor)).code;
  const gbp = (m: number) => `£${(m / 100).toFixed(2)}`;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="add-funds-title" onClick={() => setOpen(false)}>
      <div className="w-full max-w-sm rounded-2xl border border-lime/40 bg-ink-900 p-5 text-left shadow-[0_0_40px_-10px_rgb(173_252_7/0.5)]" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow text-lime">Not enough in your balance</p>
        <h2 id="add-funds-title" className="mt-1 text-3xl leading-none">Add funds to buy</h2>
        <p className="mt-2 text-sm text-muted">{message.replace(/^Not enough credit — this/, "This")}</p>
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {MX_BUNDLES.map((b) => {
            const on = b.code === best;
            const pct = bonusPct(b);
            return (
              <li key={b.code}>
                <a
                  href={`/account/wallet?bundle=${b.code}#add`}
                  className={`relative block rounded-xl border px-3 py-2.5 text-center transition ${on ? "border-lime bg-lime/10 shadow-[0_0_16px_-6px_rgb(173_252_7/0.7)]" : "border-ink-700 hover:border-ink-600"}`}
                >
                  {on && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-lime px-1.5 text-[8px] font-black uppercase tracking-wider text-ink-950">Covers it</span>}
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Pay {gbp(b.priceMinor)}</span>
                  <span className="block font-display text-2xl font-black italic leading-tight text-lime">Get {gbp(b.mxMinor)}</span>
                  <span className="block text-[10px] text-muted">{pct > 0 ? `+${pct}% bonus` : b.name}</span>
                </a>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn-ghost mt-3 w-full py-2.5" onClick={() => setOpen(false)}>
          Not now
        </button>
      </div>
    </div>
  );
}
