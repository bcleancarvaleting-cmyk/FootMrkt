"use client";

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
  if (result.code === "INSUFFICIENT_FUNDS" || result.code === "EARNED_ONLY") return <AddFundsPopup message={result.error} />;
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

/** "Add funds to buy": a bottom sheet over the page when a purchase, bid or offer needs more money. */
function AddFundsPopup({ message }: { message: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return <span className="text-xs text-danger">{message}</span>;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="add-funds-title" onClick={() => setOpen(false)}>
      <div className="w-full max-w-sm rounded-2xl border border-lime/40 bg-ink-900 p-5 text-left shadow-[0_0_40px_-10px_rgb(173_252_7/0.5)]" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow text-lime">Not enough in your balance</p>
        <h2 id="add-funds-title" className="mt-1 text-3xl leading-none">Add funds to buy</h2>
        <p className="mt-2 text-sm text-muted">{message.replace(/^Not enough credit — this/, "This")}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="btn-ghost py-3" onClick={() => setOpen(false)}>
            Not now
          </button>
          <a href="/account/wallet#add" className="btn-primary py-3">
            Add funds
          </a>
        </div>
      </div>
    </div>
  );
}
