"use client";

import { useActionState } from "react";
import { saveEmailFromAction, saveIntegrationSecretAction, saveSportmonksTokenAction } from "@/app/actions/integrations";
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

export function SecretForm({ name, label, placeholder, has, hint }: { name: string; label: string; placeholder: string; has: boolean; hint?: string }) {
  const [state, run, pending] = useActionState(saveIntegrationSecretAction.bind(null, name), null);
  const id = `secret-${name.replace(/\W/g, "-")}`;
  return (
    <form action={run} className="space-y-2">
      <label className="label" htmlFor={id}>
        {has ? `Replace the ${label.toLowerCase()}` : label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input id={id} name="value" type="password" autoComplete="off" spellCheck={false} className="input min-w-0 flex-1 basis-60 font-mono" placeholder={placeholder} required />
        <button className="btn-primary px-5 py-2.5 text-xs" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {hint && <p className="text-xs text-faint">{hint}</p>}
      {state && <ResultText result={state} />}
    </form>
  );
}

export function EmailFromForm({ value }: { value: string }) {
  const [state, run, pending] = useActionState(saveEmailFromAction, null);
  return (
    <form action={run} className="space-y-2">
      <label className="label" htmlFor="email-from">
        Send emails from
      </label>
      <div className="flex flex-wrap gap-2">
        <input id="email-from" name="from" defaultValue={value} className="input min-w-0 flex-1 basis-60" placeholder="MATCHX <hello@playmatchx.com>" required />
        <button className="btn-ghost px-5 py-2.5 text-xs" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-xs text-faint">Must be on a domain you&apos;ve verified in Resend (Domains → Add domain, then add the DNS records it shows).</p>
      {state && <ResultText result={state} />}
    </form>
  );
}
