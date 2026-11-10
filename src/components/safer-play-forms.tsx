"use client";

import { useActionState, useState } from "react";
import { pauseAction, realityCheckAction, setLimitsAction } from "@/app/actions/safer-play";
import { ResultText } from "./action-button";

const gbp = (m: number | null) => (m === null ? "" : String(m / 100));

export function LimitsForm({ daily, weekly, monthly }: { daily: number | null; weekly: number | null; monthly: number | null }) {
  const [state, run, pending] = useActionState(setLimitsAction, null);
  return (
    <form action={run} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["daily", "Per day (£)", daily],
            ["weekly", "Per week (£)", weekly],
            ["monthly", "Per month (£)", monthly],
          ] as const
        ).map(([name, label, v]) => (
          <div key={name}>
            <label className="label" htmlFor={`lim-${name}`}>
              {label}
            </label>
            <input id={`lim-${name}`} name={name} type="number" min="5" max="5000" step="1" defaultValue={gbp(v)} placeholder="No limit" className="input" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary px-5 py-2 text-xs" disabled={pending}>
          {pending ? "Saving…" : "Save limits"}
        </button>
        {state && <ResultText result={state} />}
      </div>
    </form>
  );
}

export function RealityCheckForm({ minutes }: { minutes: number }) {
  const [state, run, pending] = useActionState(realityCheckAction, null);
  return (
    <form action={run} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label" htmlFor="rc">
          Remind me every
        </label>
        <select id="rc" name="minutes" defaultValue={minutes} className="input">
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
          <option value="120">2 hours</option>
          <option value="0">Never</option>
        </select>
      </div>
      <button className="btn-ghost px-5 py-2 text-xs" disabled={pending}>
        Save
      </button>
      {state && <ResultText result={state} />}
    </form>
  );
}

export function PauseForm({ kind, options }: { kind: "timeout" | "exclusion"; options: ReadonlyArray<readonly [string, string, number]> }) {
  const [state, run, pending] = useActionState(pauseAction, null);
  const [sure, setSure] = useState(false);
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {options.map(([code, label], i) => (
          <label key={code} className="flex cursor-pointer items-center gap-2 rounded-xl border border-ink-700 px-3 py-2 text-sm has-[:checked]:border-lime">
            <input type="radio" name="length" value={code} defaultChecked={i === 0} className="accent-lime" />
            {label}
          </label>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" name="confirm" className="mt-1 accent-lime" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        {kind === "exclusion"
          ? "I understand I won't be able to log in or use MATCHX until the end date, my listings will be withdrawn and this can't be undone early."
          : "I understand I'll be logged out and can't log back in until the break ends. My listings will be withdrawn."}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className={kind === "exclusion" ? "btn-ghost border-danger px-5 py-2 text-xs text-danger" : "btn-ghost px-5 py-2 text-xs"} disabled={pending || !sure}>
          {kind === "exclusion" ? "Self-exclude" : "Start my break"}
        </button>
        {state && <ResultText result={state} />}
      </div>
    </form>
  );
}
