"use client";

import { useActionState } from "react";
import { resetForLaunchAction } from "@/app/actions/admin";
import { ResultText } from "./action-button";

/** The "Reset for launch" danger zone: type the phrase, then confirm. */
export function LaunchResetForm({ phrase }: { phrase: string }) {
  const [state, run, pending] = useActionState(resetForLaunchAction, null);
  return (
    <form
      action={run}
      onSubmit={(e) => {
        if (!window.confirm("This permanently deletes every account except admins, and all cards, balances, packs, entries and transfers. Continue?")) e.preventDefault();
      }}
      className="space-y-3"
    >
      <label className="label" htmlFor="reset-phrase">
        Type <b className="text-danger">{phrase}</b> to confirm
      </label>
      <input id="reset-phrase" name="phrase" autoComplete="off" className="input" placeholder={phrase} required />
      <button className="btn-danger px-5 py-3 text-xs" disabled={pending}>
        {pending ? "Resetting… (up to a minute)" : "Reset for launch"}
      </button>
      {state && <ResultText result={state} />}
    </form>
  );
}
