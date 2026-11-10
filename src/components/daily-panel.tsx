"use client";

import { useState, useTransition } from "react";
import { answerPredictionAction } from "@/app/actions/social";

/** Daily prediction: one yes/no question about a real upcoming match. */
export function PredictionButtons({ questionId, initial, locked }: { questionId: string; initial: boolean | null; locked: boolean }) {
  const [guess, setGuess] = useState<boolean | null>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pick = (g: boolean) =>
    start(async () => {
      const r = await answerPredictionAction(questionId, g);
      if (r.ok) {
        setGuess(g);
        setError(null);
      } else setError(r.error);
    });
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
    </div>
  );
}
