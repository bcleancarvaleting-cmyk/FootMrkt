"use client";

import { useActionState } from "react";
import { supportAction } from "@/app/actions/support";
import { ResultText } from "./action-button";

export function SupportForm({ email, categories, from, preset }: { email: string | null; categories: ReadonlyArray<readonly [string, string]>; from?: string; preset?: string }) {
  const [state, run, pending] = useActionState(supportAction, null);
  if (state?.ok) return <p className="text-sm text-mint">{state.message}</p>;
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="from" value={from ?? ""} />
      {!email && (
        <div>
          <label className="label" htmlFor="s-email">Your email</label>
          <input id="s-email" name="email" type="email" className="input" required autoComplete="email" />
        </div>
      )}
      <div>
        <label className="label" htmlFor="s-cat">What&apos;s it about?</label>
        <select id="s-cat" name="category" className="input" defaultValue={preset ?? "OTHER"}>
          {categories.map(([c, l]) => (
            <option key={c} value={c}>{l}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="s-msg">Tell us what happened</label>
        <textarea id="s-msg" name="message" rows={6} className="input" required minLength={10} maxLength={4000} placeholder="What were you doing, what did you expect, and what happened instead?" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary px-6 py-2.5 text-xs" disabled={pending}>{pending ? "Sending…" : "Send"}</button>
        {state && <ResultText result={state} />}
      </div>
    </form>
  );
}
