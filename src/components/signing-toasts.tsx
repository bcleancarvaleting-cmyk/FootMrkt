"use client";

import { useEffect, useRef, useState } from "react";
import type { Signing } from "@/server/signings";

/**
 * "✍️ Haaland has signed for Wally Wanderers" — a pop-up as players are signed across MATCHX
 * (market buys and Silver/Gold pack pulls). One at a time, each for a few seconds; easy to close.
 */
const TONE = { GOLD: "text-[#f0cb5a]", SILVER: "text-[#c9d1d9]", BRONZE: "text-[#d79a62]" } as const;

export function SigningToasts() {
  const [shown, setShown] = useState<Signing | null>(null);
  const queue = useRef<Signing[]>([]);
  const seen = useRef(new Set<string>());
  const muted = useRef(false);

  useEffect(() => {
    let stop = false;
    let after = new Date(Date.now() - 30 * 60_000).toISOString();
    let first = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/signings?after=${encodeURIComponent(after)}`, { cache: "no-store" });
        if (r.ok && !stop) {
          const list = ((await r.json()) as Signing[]).filter((s) => !seen.current.has(s.id));
          list.forEach((s) => seen.current.add(s.id));
          if (list.length) after = list[0].at;
          // On arrival, just the latest one (if recent); after that, everything new, oldest first.
          queue.current.push(...(first ? list.slice(0, 1) : [...list].reverse()));
          first = false;
        }
      } catch {
        /* try again next time */
      }
    };
    const show = () => {
      if (muted.current || document.hidden) return;
      const next = queue.current.shift();
      if (next) {
        setShown(next);
        setTimeout(() => setShown((s) => (s?.id === next.id ? null : s)), 6000);
      }
    };
    const t0 = setTimeout(poll, 6000);
    const p = setInterval(poll, 45_000);
    const s = setInterval(show, 9000);
    return () => {
      stop = true;
      clearTimeout(t0);
      clearInterval(p);
      clearInterval(s);
    };
  }, []);

  if (!shown) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[55] flex justify-center px-4 md:bottom-6 md:justify-start" role="status" aria-live="polite">
      <div key={shown.id} className="signing-pop pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border border-white/15 bg-[#0c0e10]/95 px-4 py-3 shadow-2xl backdrop-blur">
        <span className="text-2xl" aria-hidden="true">✍️</span>
        <span className="min-w-0 text-sm text-white">
          <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-[#adfc07]">Signed</span>
          <b className={TONE[shown.tier]}>{shown.player}</b> has signed for <b>{shown.club}</b>
          <span className="block text-[11px] text-white/50">{shown.how === "market" ? "from the transfer market" : `from a pack · ${shown.tier.toLowerCase()}`}</span>
        </span>
        <button
          type="button"
          onClick={() => {
            muted.current = true;
            setShown(null);
          }}
          className="ml-1 shrink-0 text-white/40 hover:text-white"
          aria-label="Hide signings"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
