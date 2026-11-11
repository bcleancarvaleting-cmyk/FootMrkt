"use client";

import Link from "next/link";
import { MX_BUNDLES, bonusPct } from "@/config/bundles";
import { useActionState, useState } from "react";
import { convertXpAction, depositAction, updateProfileAction, withdrawAction } from "@/app/actions/account";
import { ResultText } from "./action-button";

/** Buy an MX bundle by card (wallet, and the basket when MX is short). */
export function DepositForm({ enabled, initial = "squad" }: { enabled: boolean; initial?: string }) {
  const [state, action, pending] = useActionState(depositAction, null);
  const [key] = useState(() => crypto.randomUUID());
  const [pick, setPick] = useState(MX_BUNDLES.some((b) => b.code === initial) ? initial : "squad");
  const chosen = MX_BUNDLES.find((b) => b.code === pick)!;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="clientKey" value={key} />
      <input type="hidden" name="bundle" value={pick} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="MX bundles">
        {MX_BUNDLES.map((b) => {
          const on = pick === b.code;
          const bonus = bonusPct(b);
          return (
            <button
              key={b.code}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPick(b.code)}
              className={`relative flex min-w-0 flex-col items-center rounded-2xl border-2 px-2 pb-3 pt-4 text-center transition ${on ? "border-accent bg-accent/10" : b.best ? "border-gold/70 bg-ink-900" : "border-ink-700 bg-ink-900 hover:border-ink-600"}`}
            >
              {b.best && <span className="absolute -top-2.5 rounded-full bg-gold px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-ink-950">Best value</span>}
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{b.name}</span>
              <span className="mt-1 font-display text-3xl font-black italic tabular-nums">{b.mxMinor / 100} MX</span>
              <span className="text-sm font-bold">£{(b.priceMinor / 100).toFixed(2)}</span>
              <span className={`mt-1 text-[10px] font-semibold ${bonus > 0 ? "text-lime" : "text-faint"}`}>{bonus > 0 ? `+${bonus}% bonus MX` : "Entry bundle"}</span>
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-faint">{chosen.note}</p>
      <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs leading-relaxed text-fg">
        <b>MX can&apos;t be withdrawn or refunded</b> — it&apos;s for buying packs and players and entering matches. What you pull from a pack is random and
        player values go down as well as up. Only add what you can afford to spend. Not an investment.
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acceptRisk" className="mt-1 accent-lime" required />
        <span>I understand MX can&apos;t be withdrawn and player values go up and down.</span>
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
        {!enabled ? "Card top-ups coming soon" : pending ? "Starting checkout…" : `Pay £${(chosen.priceMinor / 100).toFixed(2)} by card → ${chosen.mxMinor / 100} MX`}
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

export function ConvertXpForm({ xp, perMx }: { xp: number; perMx: number }) {
  const [state, action, pending] = useActionState(convertXpAction, null);
  const max = Math.floor(xp / perMx) * perMx;
  const [amount, setAmount] = useState(String(max || perMx));
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        <input name="xp" type="number" min={perMx} step={perMx} max={Math.max(perMx, max)} value={amount} onChange={(e) => setAmount(e.target.value)} className="input w-28 text-right tabular-nums" aria-label="XP to swap" />
        <button className="btn-primary" disabled={pending || xp < perMx}>{pending ? "Swapping…" : `Swap for ${((Number(amount) || 0) / perMx).toFixed(2)} MX`}</button>
      </span>
      {state && <ResultText result={state} />}
    </form>
  );
}
