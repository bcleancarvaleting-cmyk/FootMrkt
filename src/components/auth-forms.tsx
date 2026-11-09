"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction } from "@/app/actions/auth";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="displayName">
          Manager name
        </label>
        <input className="input" id="displayName" name="displayName" required minLength={3} maxLength={24} autoComplete="nickname" />
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
