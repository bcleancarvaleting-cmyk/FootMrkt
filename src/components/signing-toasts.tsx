"use client";

import { useEffect, useRef, useState } from "react";
import type { Signing } from "@/server/signings";

/**
 * "✍️ Haaland has signed for Wally Wanderers" — a pop-up as players are signed across MATCHX
 * (market buys and Silver/Gold pack pulls). One at a time, each for a few seconds; easy to close.
 */
const TONE = { GOLD: "text-[#f0cb5a]", SILVER: "text-[#c9d1d9]", BRONZE: "text-[#d79a62]" } as const;
const FINISH = {
  RAINBOW: { label: "Rainbow", icon: "🌈", cls: "rainbow-name", border: "border-white/60" },
  DIAMOND: { label: "Diamond", icon: "💎", cls: "text-[#8fe3ff]", border: "border-[#8fe3ff]/70" },
  RUBY: { label: "Ruby", icon: "♦️", cls: "text-[#ff8fa6]", border: "border-[#ff8fa6]/70" },
} as const;

/** "just now", "12 mins ago", "3 hours ago", "1 day ago". */
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function SigningToasts() {
  const [shown, setShown] = useState<Signing | null>(null);
  const queue = useRef<Signing[]>([]);
  const seen = useRef(new Set<string>());
  const muted = useRef(false);

  useEffect(() => {
    let stop = false;
    let after = new Date(Date.now() - 24 * 3_600_000).toISOString();
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
      <div key={shown.id} className={`signing-pop pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border bg-[#0c0e10]/95 px-4 py-3 shadow-2xl backdrop-blur ${shown.finish ? `${FINISH[shown.finish.kind].border} shadow-[0_0_30px_rgba(143,227,255,0.35)]` : "border-white/15"}`}>
        <span className="text-2xl" aria-hidden="true">{shown.finish ? FINISH[shown.finish.kind].icon : "✍️"}</span>
        {shown.finish ? (
          <span className="min-w-0 text-sm text-white">
            <span className={`block text-[10px] font-black uppercase tracking-[0.18em] ${FINISH[shown.finish.kind].cls}`}>
              {shown.finish.kind === "RAINBOW" ? "Rainbow pulled · 1 of 1" : `${FINISH[shown.finish.kind].label} pulled`}
            </span>
            <b>{shown.manager}</b> packed <b className={FINISH[shown.finish.kind].cls}>{shown.player}</b> in {FINISH[shown.finish.kind].label}
            {shown.finish.kind !== "RAINBOW" && shown.finish.of ? ` (${shown.finish.serial} of ${shown.finish.of})` : "!"}
            <span className="block text-[11px] text-white/50">{ago(shown.at)}</span>
          </span>
        ) : (
          <span className="min-w-0 text-sm text-white">
            <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-[#adfc07]">Signed</span>
            <b className={TONE[shown.tier]}>{shown.player}</b> has signed for <b>{shown.club}</b>
            <span className="block text-[11px] text-white/50">
              {shown.how === "market" ? "from the transfer market" : `from a pack · ${shown.tier.toLowerCase()}`} · {ago(shown.at)}
            </span>
          </span>
        )}
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
