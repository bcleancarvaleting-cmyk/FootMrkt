"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { depositAction, setDepositLimitAction, updateProfileAction, withdrawAction } from "@/app/actions/account";
import { ResultText } from "./action-button";

export function DepositForm({ enabled, initial = 20 }: { enabled: boolean; initial?: number }) {
  const [state, action, pending] = useActionState(depositAction, null);
  const [key] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(String(initial));
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="clientKey" value={key} />
      <div>
        <label className="label" htmlFor="dep-amount">Amount — £1 buys 1 MP</label>
        <div className="flex flex-wrap gap-2">
          {["10", "20", "50", "100"].map((v) => (
            <button key={v} type="button" onClick={() => setAmount(v)} className={`chip px-3 py-1.5 text-sm ${amount === v ? "border-accent text-fg" : ""}`}>
              £{v}
            </button>
          ))}
          <input id="dep-amount" name="amount" type="number" min="10" max="500" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="input w-28" required />
        </div>
      </div>
      <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs leading-relaxed text-fg">
        <b>MP can&apos;t be withdrawn or refunded</b> — it&apos;s for buying packs and cards and entering matches. What you pull from a pack is random and
        card values go down as well as up. Only add what you can afford to spend. Not an investment.
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acceptRisk" className="mt-1 accent-lime" required />
        <span>I understand MP can&apos;t be withdrawn and player values go up and down.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acceptTerms" className="mt-1 accent-lime" required />
        <span>
          I&apos;m 18 or over and accept the{" "}
          <Link href="/legal/terms" target="_blank" className="text-lime underline">Terms</Link> and{" "}
          <Link href="/legal/risk" target="_blank" className="text-lime underline">Risk warning</Link>.
        </span>
      </label>
      <button className="btn-primary w-full" disabled={!enabled || pending}>
        {pending ? "Starting checkout…" : `Add £${amount || 0} → ${amount || 0} MP`}
      </button>
      {state && <ResultText result={state} />}
    </form>
  );
}

export function WithdrawForm({ enabled, maxMinor }: { enabled: boolean; maxMinor: number }) {
  const [state, action, pending] = useActionState(withdrawAction, null);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="wd-amount">Amount of winnings (£) — minimum £10</label>
        <input id="wd-amount" name="amount" type="number" min="10" step="0.01" max={(maxMinor / 100).toFixed(2)} defaultValue="10" className="input" required />
      </div>
      <button className="btn-ghost w-full" disabled={!enabled || pending || maxMinor < 1000}>
        {pending ? "Requesting…" : "Request withdrawal"}
      </button>
      {state && <ResultText result={state} />}
    </form>
  );
}

export function LimitForm({ currentMinor }: { currentMinor: number | null }) {
  const [state, action, pending] = useActionState(setDepositLimitAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1">
        <label className="label" htmlFor="limit">Monthly deposit limit (£)</label>
        <input id="limit" name="limit" type="number" min="5" max="5000" step="1" defaultValue={currentMinor ? currentMinor / 100 : ""} placeholder="No limit" className="input" />
      </div>
      <button className="btn-ghost" disabled={pending}>Save limit</button>
      {state && <span className="w-full"><ResultText result={state} /></span>}
    </form>
  );
}

type Profile = {
  fullName: string | null;
  dateOfBirth: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  marketingOptIn: boolean;
};

function F({ name, label, type = "text", value, auto, disabled }: { name: keyof Profile; label: string; type?: string; value: string | null; auto?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={value ?? ""} autoComplete={auto} className="input" readOnly={disabled} />
    </div>
  );
}

export function ProfileForm({ p, email, displayName, locked }: { p: Profile; email: string; displayName: string; locked: boolean }) {
  const [state, action, pending] = useActionState(updateProfileAction, null);
  return (
    <form action={action} className="space-y-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xl font-display font-bold uppercase italic">Account</legend>
        <div>
          <span className="label">Username</span>
          <p className="input bg-ink-800 text-muted">{displayName}</p>
        </div>
        <div>
          <span className="label">Email</span>
          <p className="input truncate bg-ink-800 text-muted">{email}</p>
        </div>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xl font-display font-bold uppercase italic">Personal details</legend>
        <F name="fullName" label="Full legal name" value={p.fullName} auto="name" disabled={locked} />
        <F name="dateOfBirth" label="Date of birth" type="date" value={p.dateOfBirth} auto="bday" disabled={locked} />
        <F name="phone" label="Mobile" type="tel" value={p.phone} auto="tel" />
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xl font-display font-bold uppercase italic">Address</legend>
        <F name="addressLine1" label="Address line 1" value={p.addressLine1} auto="address-line1" />
        <F name="addressLine2" label="Address line 2 (optional)" value={p.addressLine2} auto="address-line2" />
        <F name="city" label="Town / city" value={p.city} auto="address-level2" />
        <F name="postcode" label="Postcode" value={p.postcode} auto="postal-code" />
        <F name="country" label="Country" value={p.country ?? "United Kingdom"} auto="country-name" />
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="marketingOptIn" defaultChecked={p.marketingOptIn} className="mt-1 accent-lime" />
        <span>Send me news about free pack drops, auctions and new challenges. You can unsubscribe at any time.</span>
      </label>
      {locked && <p className="text-xs text-faint">Your name and date of birth are verified. Contact support to change them.</p>}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
        {state && <ResultText result={state} />}
      </div>
    </form>
  );
}
