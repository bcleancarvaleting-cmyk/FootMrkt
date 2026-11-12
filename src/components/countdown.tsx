"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
const pad = (n: number) => String(n).padStart(2, "0");

/** Live countdown to `to` (ISO string). Renders "Ended" once it passes. */
export function Countdown({ to, className = "", endedLabel = "Ended", urgentMs = 0, urgentClassName }: { to: string; className?: string; endedLabel?: string; urgentMs?: number; urgentClassName?: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  if (now === null) return <span className={`tabular-nums ${className}`}>--:--:--</span>;
  const left = target - now;
  if (left <= 0) return <span className={className}>{endedLabel}</span>;
  const p = parts(left);
  return (
    <span className={`tabular-nums ${urgentClassName && left <= urgentMs ? urgentClassName : className}`} suppressHydrationWarning>
      {p.d > 0 ? `${p.d}d ` : ""}
      {pad(p.h)}:{pad(p.m)}:{pad(p.s)}
    </span>
  );
}

/** The same countdown as four big blocks: days · hrs · mins · secs (for heroes). */
export function CountdownBlocks({ to, className = "" }: { to: string; className?: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const p = parts(now === null ? 0 : target - now);
  const cells: Array<[string, number]> = [
    ["Days", p.d],
    ["Hrs", p.h],
    ["Mins", p.m],
    ["Secs", p.s],
  ];
  return (
    <span className={`flex gap-2 ${className}`} suppressHydrationWarning>
      {cells.map(([l, v]) => (
        <span key={l} className="flex w-14 flex-col items-center rounded-xl border border-white/15 bg-black/40 py-1.5 backdrop-blur-md sm:w-16">
          <span className="font-display text-2xl font-black tabular-nums leading-none text-white sm:text-3xl">{now === null ? "--" : pad(v)}</span>
          <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">{l}</span>
        </span>
      ))}
    </span>
  );
}
