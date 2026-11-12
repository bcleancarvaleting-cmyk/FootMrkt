"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { LiveBoard, LiveFixture } from "@/server/live";
import type { TickerItem as TItem, TickerMode } from "@/server/ticker";

/**
 * The scores ticker: a broadcast-style strip under the header with today's live scores, results
 * and kick-offs, scrolling. Polls every 30 seconds (15 while games are live). When a score changes
 * it flashes GOAL!, and when one of your players scores you get a "+6 for you" pop-up.
 */
/**
 * What the strip shows depends on the page: home (and pages without their own) = games coming up
 * in the next 6 hours, real scores, then top performers; transfers = recent transfers; matches =
 * every score, real and sim; sim pages = the sim games while they're played. A page picks its
 * mode by rendering <TickerMode mode="…" /> (or <SimTickerScope />).
 */
type Mode = TickerMode;
const SCOPE: Record<Mode, "real" | "sim" | "all"> = { home: "real", transfers: "real", matches: "all", sim: "sim" };
const ModeContext = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({ mode: "home", setMode: () => {} });

export function TickerScopeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("home");
  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

/** Put on a page to choose what the strip shows while that page is open. */
export function TickerMode({ mode }: { mode: Mode }) {
  const { setMode } = useContext(ModeContext);
  useEffect(() => {
    setMode(mode);
    return () => setMode("home");
  }, [mode, setMode]);
  return null;
}

/** Sim pages: the strip shows the sim games while they're being played. */
export function SimTickerScope() {
  return <TickerMode mode="sim" />;
}

type Board = LiveBoard & { extras?: { before: TItem[]; after: TItem[] } };

export function ScoresTicker({ initial }: { initial: Board }) {
  const { mode } = useContext(ModeContext);
  const scope = SCOPE[mode];
  const [board, setBoard] = useState<Board>(initial);
  // Which mode the board on screen belongs to (hide the home strip while another page loads its own).
  const [shown, setShown] = useState<Mode>("home");
  const [flash, setFlash] = useState<{ key: number; title: string; line: string; who: string | null } | null>(null);
  const [toasts, setToasts] = useState<Array<{ key: number; text: string }>>([]);
  const prev = useRef(initial);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let switched = mode !== "home";
    const poll = async () => {
      try {
        const r = await fetch(`/api/live?scope=${scope}&mode=${mode}`, { cache: "no-store" });
        if (r.ok && !stop) {
          const next = (await r.json()) as Board;
          // Switching between real and sim games isn't a goal.
          const { flash: f, gains } = switched ? { flash: null, gains: [] } : changesBetween(prev.current, next);
          switched = false;
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
          setShown(mode);
        }
      } catch {
        /* keep the last scores */
      }
      if (!stop) timer = setTimeout(poll, prev.current.fast ? 4_000 : prev.current.liveCount > 0 ? 15_000 : 30_000);
    };
    // Another page loads its own strip straight away; home starts from the server's copy.
    timer = setTimeout(poll, mode !== "home" ? 0 : initial.fast ? 4_000 : initial.liveCount > 0 ? 15_000 : 30_000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [initial.liveCount, initial.fast, scope, mode]);

  if (shown !== mode) return null;
  const before = board.extras?.before ?? [];
  const after = board.extras?.after ?? [];
  const items = mode === "transfers" ? [] : board.fixtures;
  if (!items.length && !before.length && !after.length) return null;
  const live = board.liveCount > 0 && mode !== "transfers";
  // Long enough to read: ~3.5s per item on screen.
  const duration = Math.max(30, (items.length + before.length + after.length) * 3.5);
  const href = mode === "transfers" ? "/transfers" : mode === "sim" ? "/watch" : "/live";
  const label = mode === "transfers" ? "Transfers" : live ? `Live · ${board.liveCount}` : mode === "home" && before.length ? "Up next" : "Scores";

  return (
    <>
      <div className="scores-ticker relative z-30 flex h-9 items-stretch overflow-hidden border-b border-ink-700 bg-[#050607] text-[#f4f5f2]" role="region" aria-label={live ? "Live scores" : "Latest scores"}>
        <Link href={href} className="ticker-label relative z-10 flex shrink-0 items-center gap-2 bg-[#adfc07] pl-3 pr-6 text-[11px] font-black uppercase italic tracking-[0.14em] text-[#0a0d02]">
          {live && <span className="h-2 w-2 animate-pulse rounded-full bg-[#e5173f]" aria-hidden="true" />}
          {label}
        </Link>
        <Link href={href} className="ticker-viewport relative min-w-0 flex-1 overflow-hidden" aria-label={mode === "transfers" ? "Open Transfers" : "Open Matchday Live"}>
          <div className="ticker-track flex h-full w-max items-center" style={{ animationDuration: `${duration}s` }}>
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex h-full items-center" aria-hidden={copy === 1}>
                {before.map((t) => (
                  <ExtraItem key={`${copy}-${t.key}`} t={t} />
                ))}
                {items.map((f) => (
                  <TickerItem key={`${copy}-${f.id}`} f={f} />
                ))}
                {after.map((t) => (
                  <ExtraItem key={`${copy}-${t.key}`} t={t} />
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
            {flash.who && <p className="mt-1 text-sm font-semibold text-white/80">⚽ {flash.who}</p>}
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

const TONE: Record<NonNullable<TItem["tone"]>, string> = { lime: "text-[#adfc07]", gold: "text-[#f0cb5a]", silver: "text-[#c9d1d9]", bronze: "text-[#d79a62]", sim: "text-[#8fe3ff]" };

function ExtraItem({ t }: { t: TItem }) {
  return (
    <li className="flex h-full items-center gap-2 whitespace-nowrap border-r border-white/10 px-4 text-[12px] font-bold uppercase tracking-wide">
      <span className={`text-[9px] font-extrabold tracking-[0.16em] ${t.kind === "upcoming" && t.tone === "sim" ? "rounded bg-[#8fe3ff] px-1 text-[#04121a]" : "text-white/40"}`}>{t.tag}</span>
      <span className={t.kind === "transfer" ? TONE[t.tone ?? "lime"] : ""}>{t.title}</span>
      {t.sub && <span className="text-white/50">{t.sub}</span>}
      {t.value && <span className={`rounded bg-white/10 px-1.5 py-0.5 tabular-nums ${t.kind === "transfer" ? "text-[#adfc07]" : TONE[t.tone ?? "lime"]}`}>{t.value}</span>}
    </li>
  );
}

function TickerItem({ f }: { f: LiveFixture }) {
  const live = f.status === "LIVE";
  const done = f.status === "FINISHED";
  const ko = new Date(f.kickoffAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return (
    <li className="flex h-full items-center gap-2 border-r border-white/10 px-4 text-[12px] font-bold uppercase tracking-wide">
      {f.sim ? (
        <span className="rounded bg-[#8fe3ff] px-1 text-[9px] font-black tracking-[0.12em] text-[#04121a]" title="Simulated from real form">SIM</span>
      ) : (
        <span className="text-[9px] font-extrabold tracking-[0.16em] text-white/40">{f.league}</span>
      )}
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
  const scorer = scored?.events.find((e) => e.type === "goal" || e.type === "own_goal");
  const flash = scored
    ? {
        key: stamp,
        title: "GOAL!",
        line: `${scored.home.code} ${scored.homeGoals}–${scored.awayGoals} ${scored.away.code}${scored.clock ? ` · ${scored.clock}` : ""}`,
        who: scorer ? `${scorer.type === "own_goal" ? `${scorer.player} (og)` : scorer.player}${scorer.assist ? ` · assist ${scorer.assist}` : ""}` : null,
      }
    : null;
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
