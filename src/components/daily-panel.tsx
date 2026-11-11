"use client";

import { useState, useTransition } from "react";
import { answerPredictionAction } from "@/app/actions/social";

/** Daily prediction: one yes/no question about a real upcoming match. */
export function PredictionButtons({ questionId, initial, locked, tally }: { questionId: string; initial: boolean | null; locked: boolean; tally?: { yes: number; no: number } }) {
  const [guess, setGuess] = useState<boolean | null>(initial);
  const [counts, setCounts] = useState(tally ?? { yes: 0, no: 0 });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pick = (g: boolean) =>
    start(async () => {
      const r = await answerPredictionAction(questionId, g);
      if (r.ok) {
        // Move this manager's vote in the bar straight away.
        setCounts((c) => {
          const next = { ...c };
          if (guess === true) next.yes = Math.max(0, next.yes - 1);
          if (guess === false) next.no = Math.max(0, next.no - 1);
          if (g) next.yes += 1;
          else next.no += 1;
          return next;
        });
        setGuess(g);
        setError(null);
      } else setError(r.error);
    });
  const total = counts.yes + counts.no;
  const yesPct = total ? Math.round((counts.yes / total) * 100) : 50;
  return (
    <div>
      <div className="flex gap-2">
        {[true, false].map((g) => (
          <button
            key={String(g)}
            type="button"
            disabled={pending || locked}
            onClick={() => pick(g)}
            aria-pressed={guess === g}
            className={`flex-1 rounded-xl border px-4 py-2 text-sm font-black uppercase tracking-wider transition ${guess === g ? "border-accent bg-accent text-accent-ink" : "border-ink-600 text-fg hover:border-ink-500"} disabled:opacity-50`}
          >
            {g ? "Yes" : "No"}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      <div className="mt-3" aria-label={total ? `${yesPct}% say yes, ${100 - yesPct}% say no, from ${total} votes` : "No votes yet"}>
        <div className="flex items-baseline justify-between text-[11px] font-bold tabular-nums">
          <span className="text-lime">Yes {total ? `${yesPct}%` : "–"}</span>
          <span className="font-semibold text-faint">
            {total.toLocaleString("en-GB")} vote{total === 1 ? "" : "s"}
          </span>
          <span className="text-danger">{total ? `${100 - yesPct}%` : "–"} No</span>
        </div>
        <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-ink-800">
          {total > 0 && (
            <>
              <span className="h-full bg-accent transition-[width] duration-500" style={{ width: `${yesPct}%` }} />
              <span className="h-full flex-1 bg-danger/80" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
