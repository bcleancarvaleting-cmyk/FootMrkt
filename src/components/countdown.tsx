"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
const pad = (n: number) => String(n).padStart(2, "0");

/** Live countdown to `to` (ISO string). Renders "Ended" once it passes. */
export function Countdown({ to, className = "", endedLabel = "Ended" }: { to: string; className?: string; endedLabel?: string }) {
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
    <span className={`tabular-nums ${className}`} suppressHydrationWarning>
      {p.d > 0 ? `${p.d}d ` : ""}
      {pad(p.h)}:{pad(p.m)}:{pad(p.s)}
    </span>
  );
}
