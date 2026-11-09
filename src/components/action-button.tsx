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
