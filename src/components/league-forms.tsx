"use client";

import { useActionState } from "react";
import { createLeagueAction, joinLeagueAction } from "@/app/actions/social";

export function CreateLeagueForm() {
  const [state, action, pending] = useActionState(createLeagueAction, null);
  return (
    <form action={action} className="space-y-2">
      <label className="label" htmlFor="league-name">
        League name
      </label>
      <div className="flex gap-2">
        <input id="league-name" name="name" className="input" required minLength={3} maxLength={40} placeholder="e.g. Sunday Five-a-side" />
        <button className="btn-primary shrink-0" disabled={pending}>
          {pending ? "Creating…" : "Create"}
        </button>
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}

export function JoinLeagueForm({ code = "" }: { code?: string }) {
  const [state, action, pending] = useActionState(joinLeagueAction, null);
  return (
    <form action={action} className="space-y-2">
      <label className="label" htmlFor="league-code">
        League code
      </label>
      <div className="flex gap-2">
        <input id="league-code" name="code" defaultValue={code} className="input uppercase tracking-[0.3em]" required minLength={6} maxLength={6} placeholder="ABC123" />
        <button className="btn-ghost shrink-0" disabled={pending}>
          {pending ? "Joining…" : "Join"}
        </button>
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
