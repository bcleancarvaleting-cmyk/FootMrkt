"use client";

import { useActionState } from "react";
import { challengeAction } from "@/app/actions/h2h";
import { ResultText } from "./action-button";

export function ChallengeForm() {
  const [state, run, pending] = useActionState(challengeAction, null);
  return (
    <form action={run} className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <label className="label" htmlFor="opponent">Manager name</label>
        <input id="opponent" name="opponent" className="input" placeholder="e.g. GoldenBoot22" required maxLength={40} />
      </div>
      <button className="btn-primary px-5 py-2.5 text-xs" disabled={pending}>{pending ? "Sending…" : "Challenge"}</button>
      {state && <span className="w-full"><ResultText result={state} /></span>}
    </form>
  );
}
