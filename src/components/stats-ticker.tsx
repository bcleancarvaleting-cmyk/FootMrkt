"use client";

import { useEffect, useState } from "react";
import type { LiveStats } from "@/server/stats";

const fmt = (n: number) => n.toLocaleString("en-GB");

function countdown(to: string | null, now: number): string | null {
  if (!to) return null;
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Live stats strip. Refreshes every 30s; the deadline counts down every second and closes
 * 10 minutes before the gameweek's first kick-off.
 */
export function StatsTicker({ initial }: { initial: LiveStats }) {
  const [stats, setStats] = useState(initial);
  const [now, setNow] = useState(() => new Date(initial.generatedAt).getTime());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      try {
        const r = await fetch("/api/stats", { cache: "no-store" });
        if (r.ok) setStats(await r.json());
      } catch {
        /* keep last good numbers */
      }
    }, 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, []);

  const gw = stats.gameweek;
  const left = countdown(gw?.deadline ?? null, now);
  const deadlineCell = gw
    ? left
      ? { label: `GW${gw.number} deadline`, value: left, hot: new Date(gw.deadline!).getTime() - now < 3600_000 }
      : { label: `GW${gw.number}`, value: gw.status === "SETTLED" ? "Final" : "Squads locked", hot: false }
    : null;

  const cells = [
    ...(deadlineCell ? [deadlineCell] : []),
    { label: "Online now", value: fmt(stats.onlineNow), hot: false },
    { label: gw ? `In GW${gw.number}` : "Entered", value: fmt(stats.enteredThisGameweek), hot: false },
    { label: "Managers", value: fmt(stats.managers), hot: false },
    { label: "Cards in circulation", value: fmt(stats.cardsInCirculation), hot: false },
    { label: "Packs opened today", value: fmt(stats.packsOpenedToday), hot: false },
  ];

  return (
    <div className="border-b border-ink-800 bg-ink-950/95 text-xs" role="status" aria-live="off">
      <div className="mx-auto flex max-w-6xl items-stretch overflow-x-auto [scrollbar-width:none]">
        <div className="flex shrink-0 items-center gap-2 border-r border-ink-800 px-4 py-2.5 font-extrabold tracking-[0.18em] text-lime">
          <span className="live-dot h-2 w-2 rounded-full bg-lime" aria-hidden="true" />
          LIVE
        </div>
        {cells.map((c) => (
          <div key={c.label} className="flex shrink-0 items-baseline gap-2 border-r border-ink-800 px-4 py-2.5 last:border-r-0">
            <span className={`font-display text-base font-bold tabular-nums ${c.hot ? "text-danger" : "text-fg"}`}>{c.value}</span>
            <span className="whitespace-nowrap text-[10px] font-bold tracking-[0.14em] text-muted uppercase">{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
