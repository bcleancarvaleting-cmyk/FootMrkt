"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction, verifyLoginCodeAction } from "@/app/actions/auth";

export function RegisterForm({ referrer, clubs }: { referrer?: string; clubs: Array<{ league: string; clubs: Array<{ code: string; name: string }> }> }) {
  const [state, action, pending] = useActionState(registerAction, null);
  return (
    <form action={action} className="space-y-4">
      {referrer && <input type="hidden" name="ref" value={referrer} />}
      {referrer && <p className="rounded-xl border border-accent/40 bg-accent/5 px-3 py-2 text-sm">Invited by <b>{referrer}</b> — welcome to MATCHX!</p>}
      <div>
        <label className="label" htmlFor="displayName">
          Manager name
        </label>
        <input className="input" id="displayName" name="displayName" required minLength={3} maxLength={24} autoComplete="nickname" />
      </div>
      <div>
        <label className="label" htmlFor="clubName">
          Your club&apos;s name
        </label>
        <input className="input" id="clubName" name="clubName" required minLength={3} maxLength={30} placeholder="e.g. Hackney Wanderers" />
        <p className="mt-1 text-xs text-faint">Next you&apos;ll design its crest.</p>
      </div>
      <div>
        <label className="label" htmlFor="favouriteClub">
          Who do you support?
        </label>
        <select className="input" id="favouriteClub" name="favouriteClub" required defaultValue="">
          <option value="" disabled>
            Choose your club
          </option>
          {clubs.map((g) => (
            <optgroup key={g.league} label={g.league}>
              {g.clubs.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="none">I don&apos;t support an English club</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input className="input" id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
        <p className="mt-1 text-xs text-faint">At least 10 characters.</p>
      </div>
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" name="terms" className="mt-1 accent-lime" required />
        <span>I accept the terms of use. (Age and identity requirements are still being finalised.)</span>
      </label>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>
        {pending ? "Creating your club…" : "Create account & claim free Starter Pack"}
      </button>
      <p className="text-center text-sm text-muted">
        Already managing?{" "}
        <Link className="text-lime hover:underline" href="/login">
          Log in
        </Link>
      </p>
    </form>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? "/"} />
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
        <Link href="/forgot-password" className="mt-1.5 inline-block text-xs text-muted hover:text-fg hover:underline">
          Forgot your password?
        </Link>
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>
        {pending ? "Signing in…" : "Log in"}
      </button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link className="text-lime hover:underline" href="/register">
          Get your free squad
        </Link>
      </p>
    </form>
  );
}

export function VerifyCodeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifyLoginCodeAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="code">
          6-digit code
        </label>
        <input className="input text-center font-mono text-2xl tracking-[0.3em]" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={11} required autoFocus />
        <p className="mt-1.5 text-xs text-faint">Lost your phone? Type one of your backup codes instead (like 7KQ2-M9XD).</p>
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);
  if (state?.ok) return <p className="text-sm text-mint">{state.message}</p>;
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input className="input" id="password" name="password" type="password" minLength={10} required autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Type it again
        </label>
        <input className="input" id="confirm" name="confirm" type="password" minLength={10} required autoComplete="new-password" />
      </div>
      {state && !state.ok && <p className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </button>
      <p className="text-xs text-faint">You&apos;ll be logged out on every device and can log in again with the new password.</p>
    </form>
  );
}
