"use client";

import { useState, useTransition } from "react";
import { completeSetAction } from "@/app/actions/game";
import type { ActionResult } from "@/app/actions/result";
import { ResultText } from "./action-button";

export function CompleteSetButton({ setId, setName, cardCount }: { setId: string; setName: string; cardCount: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className="btn-primary"
        disabled={pending || result?.ok}
        onClick={() => {
          const msg = `Complete "${setName}"?\n\nThe ${cardCount} card${cardCount > 1 ? "s" : ""} used will be removed from your Binder permanently. This can't be undone.`;
          if (window.confirm(msg)) start(async () => setResult(await completeSetAction(setId, key)));
        }}
      >
        {pending ? "Completing…" : "Complete collection"}
      </button>
      {result && <ResultText result={result} />}
    </span>
  );
}
