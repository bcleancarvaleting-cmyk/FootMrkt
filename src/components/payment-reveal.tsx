"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { openPackAction, packOrderStatusAction } from "@/app/actions/game";
import { OpenPackButton } from "./pack-buttons";

type Status = { status: string; entitlementId: string | null; opened: boolean; packName: string | null } | null;

/** One line typed out a letter at a time in rainbow, with a blinking cursor while it types. */
function Typewriter({ text, onDone, className = "", tone = "rainbow" }: { text: string; onDone?: () => void; className?: string; tone?: "rainbow" | "red" }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) {
      const t = setTimeout(() => onDone?.(), 380);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN((x) => x + 1), 38);
    return () => clearTimeout(t);
  }, [n, text, onDone]);
  return (
    <p className={`${tone === "red" ? "decline-name" : "rainbow-name"} font-display font-black uppercase italic leading-[0.95] ${className}`} aria-label={text}>
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
export function PaymentReveal({ orderId, cancelled = false }: { orderId: string; cancelled?: boolean }) {
  const [st, setSt] = useState<Status | undefined>(undefined);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const [waited, setWaited] = useState(0);
  const router = useRouter();
  // The pack is built while "Building your pack…" types, so Open pack goes straight to the reveal.
  const [openingId, setOpeningId] = useState<string | null>(null);
  const building = useRef(false);

  useEffect(() => {
    let alive = true;
    let tries = 0;
    const poll = async () => {
      const s = await packOrderStatusAction(orderId).catch(() => null);
      if (!alive) return;
      setSt(s);
      tries++;
      setWaited(tries);
      if (s && s.status === "PENDING" && !cancelled && tries < 60) setTimeout(poll, 1500);
    };
    poll();
    return () => {
      alive = false;
    };
  }, [orderId, cancelled]);

  useEffect(() => {
    if (step < 1 || building.current || !st?.entitlementId) return;
    building.current = true;
    openPackAction(st.entitlementId)
      .then((r) => {
        if (r.ok) {
          setOpeningId(r.data.openingId);
          router.prefetch(`/packs/opening/${r.data.openingId}`);
        }
      })
      .catch(() => {});
  }, [step, st, router]);

  if (!open || st === null) return null;
  const paid = st?.status === "PAID";
  // Declined, failed or left Stripe's page without paying (and nothing was paid meanwhile).
  const failed = !!st && st.status !== "PAID" && (st.status === "FAILED" || st.status === "REFUNDED" || cancelled);
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
            <Typewriter tone="red" text="Payment unsuccessful" className="text-4xl sm:text-5xl" onDone={() => setStep((x) => Math.max(x, 1))} />
            {step >= 1 && <Typewriter tone="red" text="No money has been taken" className="text-2xl sm:text-3xl" onDone={() => setStep((x) => Math.max(x, 2))} />}
            {step >= 2 && (
              <div className="mt-4 flex w-full flex-col items-center gap-3 animate-reveal">
                <p className="max-w-xs text-sm text-muted">Your card was declined or the payment was cancelled. Try again, use another card, or open packs with MX or XP.</p>
                <Link href="/packs" onClick={close} className="btn-primary px-10 py-4">
                  Try again
                </Link>
                <button type="button" onClick={close} className="text-xs text-faint underline">
                  Close
                </button>
              </div>
            )}
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
                {openingId ? (
                  <button type="button" onClick={() => router.push(`/packs/opening/${openingId}`)} className="btn-primary px-10 py-4">
                    Open pack
                  </button>
                ) : st?.entitlementId ? (
                  <OpenPackButton entitlementId={st.entitlementId} label="Open pack" />
                ) : (
                  <Link href="/packs" onClick={close} className="btn-primary px-10 py-4">
                    {st?.opened ? "Already opened — see Packs" : "Go to my packs"}
                  </Link>
                )}
                {!openingId && (
                  <button type="button" onClick={close} className="text-xs text-faint underline">
                    Open it later
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
