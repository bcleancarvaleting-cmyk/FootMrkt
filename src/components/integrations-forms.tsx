"use client";

import { useActionState } from "react";
import { saveSportmonksTokenAction } from "@/app/actions/integrations";
import { ResultText } from "./action-button";

export function SportmonksTokenForm({ hasToken }: { hasToken: boolean }) {
  const [state, run, pending] = useActionState(saveSportmonksTokenAction, null);
  return (
    <form action={run} className="space-y-2">
      <label className="label" htmlFor="sm-token">
        {hasToken ? "Replace the API token" : "Sportmonks API token"}
      </label>
      <div className="flex flex-wrap gap-2">
        <input id="sm-token" name="token" type="password" autoComplete="off" spellCheck={false} className="input min-w-0 flex-1 font-mono" placeholder="Paste the token from my.sportmonks.com → API → Tokens" required />
        <button className="btn-primary px-5 py-2.5 text-xs" disabled={pending}>
          {pending ? "Checking with Sportmonks…" : "Save token"}
        </button>
      </div>
      <p className="text-xs text-faint">It&apos;s checked with Sportmonks before it&apos;s saved, then stored encrypted. Only the last 4 characters are ever shown here.</p>
      {state && <ResultText result={state} />}
    </form>
  );
}
