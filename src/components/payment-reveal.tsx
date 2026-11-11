"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { packOrderStatusAction } from "@/app/actions/game";
import { OpenPackButton } from "./pack-buttons";

type Status = { status: string; entitlementId: string | null; opened: boolean; packName: string | null } | null;

/** One line typed out a letter at a time in rainbow, with a blinking cursor while it types. */
function Typewriter({ text, onDone, className = "" }: { text: string; onDone?: () => void; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) {
      const t = setTimeout(() => onDone?.(), 650);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN((x) => x + 1), 55);
    return () => clearTimeout(t);
  }, [n, text, onDone]);
  return (
    <p className={`rainbow-name font-display font-black uppercase italic leading-[0.95] ${className}`} aria-label={text}>
      {text.slice(0, n)}
      {n < text.length && <span className="ml-0.5 inline-block w-[0.5ch] animate-pulse text-white [-webkit-text-fill-color:#fff]">|</span>}
    </p>
  );
}

/**
 * After paying for a pack: waits for the payment provider to confirm (signed webhook), then types
 * "Payment successful" → "Building your pack…" → "Who will you get…" and offers Open pack.
 * "Payment successful" only ever shows once the order is really PAID.
 */
export function PaymentReveal({ orderId }: { orderId: string }) {
  const [st, setSt] = useState<Status | undefined>(undefined);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    let alive = true;
    let tries = 0;
    const poll = async () => {
      const s = await packOrderStatusAction(orderId).catch(() => null);
      if (!alive) return;
      setSt(s);
      tries++;
      setWaited(tries);
      if (s && s.status === "PENDING" && tries < 60) setTimeout(poll, 1500);
    };
    poll();
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (!open || st === null) return null;
  const paid = st?.status === "PAID";
  const failed = st && (st.status === "FAILED" || st.status === "REFUNDED");
  const close = () => {
    setOpen(false);
    window.history.replaceState(null, "", "/packs");
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink-950/95 p-6 backdrop-blur" role="dialog" aria-modal="true" aria-label="Your pack">
      <div className="pointer-events-none absolute inset-x-0 top-1/4 mx-auto h-72 w-[80%] max-w-lg rounded-full bg-accent/15 blur-3xl" aria-hidden="true" />
      <div className="relative flex w-full max-w-md flex-col items-center gap-4 text-center">
        {!paid && !failed && (
          <>
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-ink-700 border-t-accent" aria-hidden="true" />
            <p className="text-sm text-muted">{waited > 20 ? "Still waiting for your bank to confirm — this can take a minute." : "Confirming your payment…"}</p>
          </>
        )}
        {failed && (
          <>
            <p className="font-display text-3xl font-black uppercase italic text-danger">Payment didn&apos;t go through</p>
            <p className="text-sm text-muted">You haven&apos;t been charged for a pack. Try again, or pay with MX or XP.</p>
            <button type="button" onClick={close} className="btn-ghost mt-2">
              Back to packs
            </button>
          </>
        )}
        {paid && (
          <>
            <Typewriter text="Payment successful" className="text-4xl sm:text-5xl" onDone={() => setStep((s) => Math.max(s, 1))} />
            {step >= 1 && <Typewriter text="Building your pack…" className="text-3xl sm:text-4xl" onDone={() => setStep((s) => Math.max(s, 2))} />}
            {step >= 2 && <Typewriter text="Who will you get…" className="text-3xl sm:text-4xl" onDone={() => setStep((s) => Math.max(s, 3))} />}
            {step >= 3 && (
              <div className="mt-4 flex w-full flex-col items-center gap-3 animate-reveal">
                {st?.packName && <p className="text-sm font-semibold text-muted">{st.packName}</p>}
                {st?.entitlementId ? (
                  <OpenPackButton entitlementId={st.entitlementId} label="Open pack" />
                ) : (
                  <Link href="/packs" onClick={close} className="btn-primary px-10 py-4">
                    {st?.opened ? "Already opened — see Packs" : "Go to my packs"}
                  </Link>
                )}
                <button type="button" onClick={close} className="text-xs text-faint underline">
                  Open it later
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
