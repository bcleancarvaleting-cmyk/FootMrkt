"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { convertWinningsAction, withdrawAction } from "@/app/actions/account";
import { ResultText } from "./action-button";

type Prefill = { fullName: string; line1: string; line2: string; city: string; postcode: string; country: string; dob: string };
const gbp = (m: number) => `£${(m / 100).toFixed(2)}`;

/**
 * The two things you can do with £ winnings, beside the Winnings balance:
 *  • Withdraw to my bank — bank details, address, date of birth and ID, checked by MATCHX before paying.
 *  • Convert to balance — moves winnings into spend-only credit, after a warning and an "are you sure?".
 */
export function WinningsActions({ winningsMinor, withdrawalsOn, prefill }: { winningsMinor: number; withdrawalsOn: boolean; prefill: Prefill }) {
  const [open, setOpen] = useState<null | "withdraw" | "convert">(null);
  return (
    <>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOpen("withdraw")} disabled={winningsMinor <= 0} className="btn-primary px-3 py-2.5 text-[11px] disabled:opacity-40">
          Withdraw to bank
        </button>
        <button type="button" onClick={() => setOpen("convert")} disabled={winningsMinor <= 0} className="btn border border-white/25 px-3 py-2.5 text-[11px] text-fg hover:border-white/60 disabled:opacity-40">
          Convert to balance
        </button>
      </div>
      {open && (
        <Modal title={open === "withdraw" ? "Withdraw to my bank" : "Convert to balance"} onClose={() => setOpen(null)}>
          {open === "withdraw" ? <WithdrawSheet winningsMinor={winningsMinor} on={withdrawalsOn} prefill={prefill} /> : <ConvertSheet winningsMinor={winningsMinor} />}
        </Modal>
      )}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto max-h-[92dvh] w-[min(560px,calc(100vw-24px))] overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-0 text-fg backdrop:bg-black/70">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-700 bg-ink-900 px-5 py-3">
        <h2 className="text-2xl">{title}</h2>
        <button type="button" onClick={() => ref.current?.close()} className="rounded-full px-2 text-2xl leading-none text-muted hover:text-fg" aria-label="Close">
          ×
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

function L({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function WithdrawSheet({ winningsMinor, on, prefill }: { winningsMinor: number; on: boolean; prefill: Prefill }) {
  const [state, run, pending] = useActionState(withdrawAction, null);
  if (state?.ok) return <ResultText result={state} />;
  const canAmount = winningsMinor >= 1000;
  return (
    <form action={run} className="space-y-4">
      {!on && <p className="rounded-xl border border-warn/50 bg-warn/10 p-3 text-sm">Withdrawals open soon — your winnings are safe here until then.</p>}
      {!canAmount && <p className="rounded-xl border border-ink-600 p-3 text-sm text-muted">The minimum withdrawal is £10 — you have {gbp(winningsMinor)}.</p>}
      <L id="w-amount" label={`Amount (£) — up to ${gbp(winningsMinor)}, minimum £10`}>
        <input id="w-amount" name="amount" type="number" min="10" step="0.01" max={(winningsMinor / 100).toFixed(2)} defaultValue={(winningsMinor / 100).toFixed(2)} className="input" required />
      </L>

      <fieldset className="space-y-3 rounded-xl border border-ink-700 p-3">
        <legend className="px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-faint">Your bank (UK)</legend>
        <L id="w-name" label="Name on the account">
          <input id="w-name" name="payeeName" defaultValue={prefill.fullName} autoComplete="name" className="input" required />
        </L>
        <div className="grid grid-cols-2 gap-3">
          <L id="w-sort" label="Sort code">
            <input id="w-sort" name="sortCode" inputMode="numeric" placeholder="12-34-56" className="input" required />
          </L>
          <L id="w-acc" label="Account number">
            <input id="w-acc" name="accountNumber" inputMode="numeric" placeholder="12345678" maxLength={8} className="input" required />
          </L>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-ink-700 p-3">
        <legend className="px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-faint">Your address</legend>
        <input name="line1" defaultValue={prefill.line1} placeholder="Address line 1" autoComplete="address-line1" className="input" required aria-label="Address line 1" />
        <input name="line2" defaultValue={prefill.line2} placeholder="Address line 2 (optional)" autoComplete="address-line2" className="input" aria-label="Address line 2" />
        <div className="grid grid-cols-2 gap-3">
          <input name="city" defaultValue={prefill.city} placeholder="Town / city" autoComplete="address-level2" className="input" required aria-label="Town or city" />
          <input name="postcode" defaultValue={prefill.postcode} placeholder="Postcode" autoComplete="postal-code" className="input" required aria-label="Postcode" />
        </div>
        <input name="country" defaultValue={prefill.country || "United Kingdom"} autoComplete="country-name" className="input" aria-label="Country" />
        <L id="w-dob" label="Date of birth">
          <input id="w-dob" name="dob" type="date" defaultValue={prefill.dob} className="input" required />
        </L>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-ink-700 p-3">
        <legend className="px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-faint">Your ID</legend>
        <div className="grid grid-cols-2 gap-3">
          <L id="w-idt" label="Type of ID">
            <select id="w-idt" name="idType" className="input" defaultValue="PASSPORT">
              <option value="PASSPORT">Passport</option>
              <option value="DRIVING_LICENCE">Driving licence</option>
              <option value="ID_CARD">National ID card</option>
            </select>
          </L>
          <L id="w-idn" label="ID number">
            <input id="w-idn" name="idNumber" className="input" required />
          </L>
        </div>
        <L id="w-idi" label="Photo of your ID (JPG, PNG, HEIC or PDF, up to 6MB)">
          <input id="w-idi" name="idImage" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" capture="environment" className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:text-xs file:font-black file:text-accent-ink" required />
        </L>
        <p className="text-[11px] text-faint">We use this only to check it&apos;s you before paying out, as the law requires. Only MATCHX staff can see it.</p>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1 h-4 w-4 accent-lime" required /> These details are mine and correct. I understand payouts go only to a bank account in my name.
      </label>
      <button className="btn-primary w-full py-3" disabled={!on || !canAmount || pending}>
        {pending ? "Sending…" : "Request withdrawal"}
      </button>
      {state && <ResultText result={state} />}
      <p className="text-center text-[11px] text-faint">We check every request and usually pay within 3 working days. The money is held while we check; if we can&apos;t pay it, it&apos;s returned to your winnings.</p>
    </form>
  );
}

function ConvertSheet({ winningsMinor }: { winningsMinor: number }) {
  const [state, run, pending] = useActionState(convertWinningsAction, null);
  const [step, setStep] = useState<1 | 2>(1);
  const [amount, setAmount] = useState((winningsMinor / 100).toFixed(2));
  const [ref] = useState(() => crypto.randomUUID());
  const minor = Math.round(Number(amount) * 100);
  const valid = minor > 0 && minor <= winningsMinor;
  if (state?.ok) return <ResultText result={state} />;
  return step === 1 ? (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="c-amount">
          Amount (£) — up to {gbp(winningsMinor)}
        </label>
        <input id="c-amount" type="number" min="0.01" step="0.01" max={(winningsMinor / 100).toFixed(2)} value={amount} onChange={(e) => setAmount(e.target.value)} className="input" />
      </div>
      <div className="rounded-xl border border-warn/60 bg-warn/10 p-4 text-sm">
        <p className="font-black uppercase tracking-wide text-warn">⚠ Warning</p>
        <p className="mt-1">
          If you convert this to your balance it <b>can&apos;t be reversed</b>. The funds will stay in the game — for players, packs, match entries and the Transfer list — and <b>can no longer be withdrawn</b> to your bank.
        </p>
      </div>
      <button type="button" className="btn-primary w-full py-3" disabled={!valid} onClick={() => setStep(2)}>
        Continue
      </button>
    </div>
  ) : (
    <form action={run} className="space-y-4">
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="ref" value={ref} />
      <input type="hidden" name="sure" value="yes" />
      <div className="rounded-2xl border border-danger/60 bg-danger/10 p-5 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-danger">Are you sure?</p>
        <p className="mt-2 font-display text-4xl font-black italic">{gbp(minor)}</p>
        <p className="mt-2 text-sm">
          moves from your <b className="text-lime">winnings</b> into your <b>£ balance</b>. This is final — you won&apos;t be able to withdraw it.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost py-3" onClick={() => setStep(1)}>
          Go back
        </button>
        <button className="btn bg-danger py-3 text-white" disabled={pending}>
          {pending ? "Moving…" : "Yes, convert it"}
        </button>
      </div>
      {state && <ResultText result={state} />}
    </form>
  );
}
