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
  // Not enough money: one tap to the fix — top up (bundles), or swap XP when it needs earned credit.
  if (result.code === "INSUFFICIENT_FUNDS" || result.code === "EARNED_ONLY") {
    const earned = result.code === "EARNED_ONLY";
    return (
      <span className="flex max-w-[18rem] flex-col items-end gap-1 whitespace-normal text-right text-xs text-danger">
        {result.error}
        <a href={earned ? "/account/wallet#xp" : "/account/wallet#add"} className="rounded-full border border-lime/70 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-lime shadow-[0_0_14px_-4px_rgb(173_252_7/0.6)]">
          {earned ? "Swap XP for £ →" : "Add funds →"}
        </a>
      </span>
    );
  }
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
