"use client";

import { useActionState } from "react";
import { inviteModeratorAction } from "@/app/actions/moderation";
import { ResultText } from "./action-button";

export function InviteModeratorForm() {
  const [state, action, pending] = useActionState(inviteModeratorAction, null);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <label htmlFor="mod-who" className="sr-only">
        Manager name or email
      </label>
      <input id="mod-who" name="who" className="input max-w-xs" placeholder="Manager name or email" required />
      <button className="btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Invite moderator"}
      </button>
      {state && <ResultText result={state} />}
    </form>
  );
}
