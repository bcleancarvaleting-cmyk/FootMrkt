"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LiveBoard, LiveFixture } from "@/server/live";

/**
 * The scores ticker: a broadcast-style strip under the header with today's live scores, results
 * and kick-offs, scrolling. Polls every 30 seconds (15 while games are live). When a score changes
 * it flashes GOAL!, and when one of your players scores you get a "+6 for you" pop-up.
 */
export function ScoresTicker({ initial }: { initial: LiveBoard }) {
  const [board, setBoard] = useState(initial);
  const [flash, setFlash] = useState<{ key: number; title: string; line: string } | null>(null);
  const [toasts, setToasts] = useState<Array<{ key: number; text: string }>>([]);
  const prev = useRef(initial);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        if (r.ok && !stop) {
          const next = (await r.json()) as LiveBoard;
          const { flash: f, gains } = changesBetween(prev.current, next);
          if (f) {
            setFlash(f);
            setTimeout(() => setFlash(null), 5200);
          }
          if (gains.length) {
            setToasts((t) => [...t, ...gains].slice(-3));
            setTimeout(() => setToasts((t) => t.filter((x) => !gains.some((g) => g.key === x.key))), 6000);
          }
          prev.current = next;
          setBoard(next);
        }
      } catch {
        /* keep the last scores */
      }
      if (!stop) timer = setTimeout(poll, prev.current.liveCount > 0 ? 15_000 : 30_000);
    };
    timer = setTimeout(poll, initial.liveCount > 0 ? 15_000 : 30_000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [initial.liveCount]);

  if (!board.fixtures.length) return null;
  const live = board.liveCount > 0;
  const items = board.fixtures;
  // Long enough to read: ~3.5s per match on screen.
  const duration = Math.max(30, items.length * 3.5);

  return (
    <>
      <div className="scores-ticker relative z-30 flex h-9 items-stretch overflow-hidden border-b border-ink-700 bg-[#050607] text-[#f4f5f2]" role="region" aria-label={live ? "Live scores" : "Latest scores"}>
        <Link href="/live" className="ticker-label relative z-10 flex shrink-0 items-center gap-2 bg-[#adfc07] pl-3 pr-6 text-[11px] font-black uppercase italic tracking-[0.14em] text-[#0a0d02]">
          {live && <span className="h-2 w-2 animate-pulse rounded-full bg-[#e5173f]" aria-hidden="true" />}
          {live ? `Live · ${board.liveCount}` : "Scores"}
        </Link>
        <Link href="/live" className="ticker-viewport relative min-w-0 flex-1 overflow-hidden" aria-label="Open Matchday Live">
          <div className="ticker-track flex h-full w-max items-center" style={{ animationDuration: `${duration}s` }}>
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex h-full items-center" aria-hidden={copy === 1}>
                {items.map((f) => (
                  <TickerItem key={`${copy}-${f.id}`} f={f} />
                ))}
              </ul>
            ))}
          </div>
        </Link>
      </div>

      {flash && (
        <div key={flash.key} className="goal-flash pointer-events-none fixed inset-x-0 top-24 z-[60] flex justify-center px-4" role="status" aria-live="assertive">
          <div className="goal-flash-card rounded-2xl border border-[#adfc07] bg-[#07080a]/95 px-8 py-4 text-center shadow-[0_0_60px_rgba(173,252,7,0.45)]">
            <p className="font-display text-6xl font-black uppercase italic leading-none text-[#adfc07]">{flash.title}</p>
            <p className="mt-1 font-display text-2xl font-bold uppercase italic tabular-nums text-white">{flash.line}</p>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-28 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 md:bottom-8" role="status" aria-live="polite">
          {toasts.map((t) => (
            <Link key={t.key} href="/live" className="points-toast rounded-xl border border-[#adfc07]/70 bg-[#0c0e10] px-4 py-3 text-sm font-bold text-white shadow-2xl">
              {t.text}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function TickerItem({ f }: { f: LiveFixture }) {
  const live = f.status === "LIVE";
  const done = f.status === "FINISHED";
  const ko = new Date(f.kickoffAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return (
    <li className="flex h-full items-center gap-2 border-r border-white/10 px-4 text-[12px] font-bold uppercase tracking-wide">
      <span className="text-[9px] font-extrabold tracking-[0.16em] text-white/40">{f.league}</span>
      <span className="h-3 w-1 rounded-sm" style={{ background: f.home.colour }} aria-hidden="true" />
      <span>{f.home.code}</span>
      {f.status === "SCHEDULED" || f.status === "POSTPONED" ? (
        <span className="rounded bg-white/10 px-1.5 py-0.5 tabular-nums text-white/70">{f.status === "POSTPONED" ? "P–P" : ko}</span>
      ) : (
        <span className={`rounded px-1.5 py-0.5 font-display text-[15px] font-black italic tabular-nums ${live ? "bg-[#adfc07] text-[#0a0d02]" : "bg-white/15 text-white"}`}>
          {f.homeGoals ?? 0}–{f.awayGoals ?? 0}
        </span>
      )}
      <span>{f.away.code}</span>
      <span className="h-3 w-1 rounded-sm" style={{ background: f.away.colour }} aria-hidden="true" />
      {live && <span className="text-[10px] font-extrabold text-[#e5173f]">{f.clock}</span>}
      {done && <span className="text-[10px] font-extrabold text-white/40">FT</span>}
    </li>
  );
}

/** What changed between two polls: a goal to flash, and points your players just won. */
function changesBetween(a: LiveBoard, b: LiveBoard) {
  const before = new Map(a.fixtures.map((f) => [f.id, (f.homeGoals ?? 0) + (f.awayGoals ?? 0)]));
  const scored = b.fixtures.find((f) => f.status === "LIVE" && before.has(f.id) && (f.homeGoals ?? 0) + (f.awayGoals ?? 0) > before.get(f.id)!);
  const stamp = Date.now();
  const flash = scored ? { key: stamp, title: "GOAL!", line: `${scored.home.code} ${scored.homeGoals}–${scored.awayGoals} ${scored.away.code}${scored.clock ? ` · ${scored.clock}` : ""}` } : null;
  const old = new Map((a.mine?.players ?? []).map((p) => [p.playerId, p]));
  const gains = (b.mine?.players ?? []).flatMap((p, i) => {
    const o = old.get(p.playerId);
    if (!o || p.points <= o.points) return [];
    const why = p.goals > o.goals ? "goal" : p.assists > o.assists ? "assist" : "points";
    const icon = why === "goal" ? "⚽" : why === "assist" ? "🅰️" : "📈";
    return [{ key: stamp + i, text: `${icon} ${p.name} +${Math.round((p.points - o.points) * 10) / 10} pts for you${why === "points" ? "" : ` (${why})`}` }];
  });
  return { flash, gains };
}
