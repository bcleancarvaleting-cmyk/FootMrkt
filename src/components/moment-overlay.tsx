"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { momentShownAction } from "@/app/actions/moments";

type Moment = { id: string; kind: string; icon: string; title: string; subtitle: string; href: string | null; cta: string | null };

const COLOURS = ["#adfc07", "#f2cf63", "#ffffff", "#5ee69a", "#8fe3ff"];

/**
 * The celebration: light rays, the trophy (or star, rocket, ball) springing in, the headline, and
 * confetti — shown once for each big moment. Tap anywhere outside, "Nice!" or Esc to close.
 */
export function MomentOverlay({ moment }: { moment: Moment | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!moment) return;
    const t = setTimeout(() => {
      setOpen(true);
      try {
        navigator.vibrate?.([30, 60, 30]);
      } catch {
        /* no haptics */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [moment]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    setOpen(false);
    if (moment) void momentShownAction(moment.id);
  }

  if (!moment || !open) return null;
  return (
    <div className="moment-backdrop fixed inset-0 z-[80] flex items-center justify-center bg-black/85 px-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="moment-title" onClick={close}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 42 }, (_, i) => (
          <span
            key={i}
            className="confetti"
            style={{
              left: `${(i * 37) % 100}%`,
              background: COLOURS[i % COLOURS.length],
              animationDelay: `${(i % 7) * 0.12}s`,
              animationDuration: `${2.6 + (i % 5) * 0.35}s`,
              width: i % 3 ? 8 : 12,
              height: i % 3 ? 14 : 8,
            }}
          />
        ))}
      </div>
      <div className="moment-card relative flex max-w-md flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex h-48 w-48 items-center justify-center">
          <span className="moment-rays absolute inset-[-40%] rounded-full" aria-hidden="true" />
          <span className="absolute inset-6 rounded-full bg-[#adfc07]/20 blur-2xl" aria-hidden="true" />
          <span className="moment-icon relative text-[110px] leading-none drop-shadow-[0_0_30px_rgba(173,252,7,0.6)]" aria-hidden="true">
            {moment.icon}
          </span>
        </div>
        <h2 id="moment-title" className="moment-title mt-2 font-display text-6xl font-black uppercase italic leading-[0.9] sm:text-7xl">
          {moment.title}
        </h2>
        <p className="moment-sub mt-3 text-lg text-white/85">{moment.subtitle}</p>
        <div className="moment-sub mt-7 flex flex-wrap justify-center gap-3">
          {moment.href && moment.cta && (
            <Link href={moment.href} onClick={close} className="btn-primary px-7 py-3.5 text-sm">
              {moment.cta}
            </Link>
          )}
          <button type="button" onClick={close} className="btn border border-white/30 px-7 py-3.5 text-sm text-white hover:border-white/70" autoFocus>
            Nice!
          </button>
        </div>
      </div>
    </div>
  );
}
