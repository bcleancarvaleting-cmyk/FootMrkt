"use client";

import { useActionState } from "react";
import { blockUserAction } from "@/app/actions/admin-users";
import { ResultText } from "./action-button";

/** Block a manager, with a reason for the audit log. */
export function BlockUserForm({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState(blockUserAction.bind(null, userId), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Block ${name}? They'll be signed out, can't log in or trade, and their Transfer listings come down.`)) e.preventDefault();
      }}
      className="space-y-2"
    >
      <label className="block text-xs font-semibold text-muted" htmlFor="reason">
        Reason (kept in the audit log)
      </label>
      <div className="flex flex-wrap gap-2">
        <input id="reason" name="reason" required minLength={3} maxLength={300} placeholder="e.g. multiple accounts, price manipulation" className="input min-w-0 flex-1 basis-60" />
        <button className="btn-ghost border-danger/60 text-danger" disabled={pending}>
          {pending ? "Blocking…" : "Block account"}
        </button>
      </div>
      {state && <ResultText result={state} />}
    </form>
  );
}
