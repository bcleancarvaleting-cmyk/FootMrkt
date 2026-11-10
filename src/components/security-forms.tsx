"use client";

import { useActionState, useState, useTransition } from "react";
import { beginTotpAction, changePasswordAction, confirmTotpAction, disableTotpAction, newBackupCodesAction } from "@/app/actions/security";
import type { ActionResult } from "@/app/actions/result";
import { ResultText } from "./action-button";

export function ChangePasswordForm() {
  const [state, run, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={run} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="pw-current">Current password</label>
          <input id="pw-current" name="current" type="password" className="input" required autoComplete="current-password" />
        </div>
        <div>
          <label className="label" htmlFor="pw-next">New password</label>
          <input id="pw-next" name="next" type="password" className="input" minLength={10} required autoComplete="new-password" />
        </div>
        <div>
          <label className="label" htmlFor="pw-confirm">New password again</label>
          <input id="pw-confirm" name="confirm" type="password" className="input" minLength={10} required autoComplete="new-password" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary px-5 py-2 text-xs" disabled={pending}>{pending ? "Saving…" : "Change password"}</button>
        {state && <ResultText result={state} />}
      </div>
    </form>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="space-y-2 rounded-xl border border-warn/40 bg-warn/10 p-4">
      <p className="text-sm font-semibold">Your backup codes — save them somewhere safe now. Each works once, and you won&apos;t see them again.</p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-5">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <button type="button" className="btn-ghost px-4 py-2 text-xs" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}>Copy all</button>
    </div>
  );
}

export function TwoStepSetup() {
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string; url: string } | null>(null);
  const [startErr, setStartErr] = useState<ActionResult<unknown> | null>(null);
  const [starting, start] = useTransition();
  const [state, run, pending] = useActionState(confirmTotpAction, null);

  if (state?.ok) return <BackupCodes codes={state.data} />;
  if (!setup) {
    return (
      <div className="space-y-2">
        <button type="button" className="btn-primary px-5 py-2 text-xs" disabled={starting} onClick={() => start(async () => {
          const r = await beginTotpAction();
          if (r.ok) setSetup(r.data);
          else setStartErr(r);
        })}>
          {starting ? "Starting…" : "Turn on two-step login"}
        </button>
        {startErr && <ResultText result={startErr} />}
      </div>
    );
  }
  return (
    <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
      {/* The QR is generated on our server from the secret — nothing is sent to a third party. */}
      <div className="w-[200px] rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} aria-label="QR code to scan with your authenticator app" />
      <div className="space-y-3 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-muted">
          <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
          <li>Scan the code — or on this phone, <a href={setup.url} className="text-lime underline">tap here</a>, or type this key: <code className="break-all font-mono text-fg">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code></li>
          <li>Enter the 6-digit code it shows.</li>
        </ol>
        <form action={run} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="totp-code">Code</label>
            <input id="totp-code" name="code" className="input w-40 text-center font-mono text-lg tracking-[0.2em]" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required />
          </div>
          <button className="btn-primary px-5 py-2 text-xs" disabled={pending}>{pending ? "Checking…" : "Turn on"}</button>
        </form>
        {state && !state.ok && <ResultText result={state} />}
      </div>
    </div>
  );
}

export function TwoStepManage({ codesLeft }: { codesLeft: number }) {
  const [state, run, pending] = useActionState(disableTotpAction, null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, start] = useTransition();
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="text-mint">On.</span> You&apos;ll be asked for a code from your app when you log in. Backup codes left: <b>{codesLeft}</b>.
      </p>
      {codes ? (
        <BackupCodes codes={codes} />
      ) : (
        <button type="button" className="btn-ghost px-4 py-2 text-xs" disabled={busy} onClick={() => start(async () => {
          const r = await newBackupCodesAction();
          if (r.ok) setCodes(r.data);
        })}>
          Make new backup codes
        </button>
      )}
      <form action={run} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="off-pw">Password (to turn it off)</label>
          <input id="off-pw" name="password" type="password" className="input" required autoComplete="current-password" />
        </div>
        <button className="btn-ghost px-4 py-2 text-xs text-danger" disabled={pending}>Turn off two-step login</button>
        {state && <ResultText result={state} />}
      </form>
    </div>
  );
}
