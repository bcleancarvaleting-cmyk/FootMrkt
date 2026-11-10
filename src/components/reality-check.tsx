"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "mx-session-start";

/**
 * Reality check: every N minutes of a session, a reminder of how long you've been playing and how
 * much you've paid by card today. A "session" is this browser tab's visit (it resets after 30 minutes away).
 */
export function RealityCheck({ minutes, spentToday }: { minutes: number; spentToday: string }) {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!minutes) return;
    let start = Date.now();
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { start: number; seen: number } | null;
      if (saved && Date.now() - saved.seen < 30 * 60_000) start = saved.start;
    } catch {}
    const tick = () => {
      const played = Math.floor((Date.now() - start) / 60_000);
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ start, seen: Date.now() }));
      } catch {}
      const due = Math.floor(played / minutes);
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(`${KEY}-last`) ?? 0);
      } catch {}
      if (due > 0 && due > last) {
        try {
          sessionStorage.setItem(`${KEY}-last`, String(due));
        } catch {}
        setShown(played);
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [minutes]);

  if (shown === null) return null;
  const h = Math.floor(shown / 60);
  const m = shown % 60;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="rc-title">
      <div className="panel w-full max-w-sm space-y-3 p-6 text-center">
        <p className="eyebrow">Reality check</p>
        <h2 id="rc-title" className="text-3xl">
          {h ? `${h}h ${m}m` : `${m} minutes`} playing
        </h2>
        <p className="text-sm text-muted">You&apos;ve paid {spentToday} by card today.</p>
        <div className="flex flex-col gap-2 pt-2">
          <button type="button" className="btn-primary py-3" onClick={() => setShown(null)}>
            Keep playing
          </button>
          <Link href="/account/safer-play" className="btn-ghost py-3" onClick={() => setShown(null)}>
            Safer play settings
          </Link>
        </div>
      </div>
    </div>
  );
}
