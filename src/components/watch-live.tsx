"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { WatchBoard, WatchFixture, WatchLine, WatchTable } from "@/server/watch";

const ROW = 52; // px per table row (rows slide to their new place)
const ICON: Record<WatchLine["kind"], string> = { goal: "⚽", own_goal: "⚽", yellow: "🟨", red: "🟥", pen_miss: "❌" };

/**
 * Watch live: a broadcast-style screen. Vidiprinter of every goal and card as it happens, every
 * score with a GOAL flash when it changes, and the live tables with managers sliding up and down.
 */
export function WatchLive({ initial }: { initial: WatchBoard }) {
  const [board, setBoard] = useState(initial);
  const [goals, setGoals] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState<Map<string, number>>(new Map());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState(initial.tables[0]?.id ?? "");
  const [now, setNow] = useState(() => Date.now());
  const last = useRef(initial);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await fetch(`/api/watch?scope=${initial.scope}`, { cache: "no-store" });
        if (r.ok && !stop) {
          const next = (await r.json()) as WatchBoard;
          const prev = last.current;
          const before = new Map(prev.fixtures.map((f) => [f.id, f.homeGoals + f.awayGoals]));
          const scored = new Set(next.fixtures.filter((f) => before.has(f.id) && f.homeGoals + f.awayGoals > before.get(f.id)!).map((f) => f.id));
          const seen = new Set(prev.feed.map((l) => l.key));
          const newLines = new Set(next.feed.filter((l) => !seen.has(l.key)).map((l) => l.key));
          const oldRank = new Map(prev.tables.flatMap((t) => t.rows.map((r) => [`${t.id}:${r.userId}`, r.rank] as const)));
          const moved = new Map<string, number>();
          for (const t of next.tables) for (const r of t.rows) {
            const o = oldRank.get(`${t.id}:${r.userId}`);
            if (o && o !== r.rank) moved.set(`${t.id}:${r.userId}`, o - r.rank);
          }
          if (scored.size) {
            setGoals(scored);
            setTimeout(() => setGoals(new Set()), 4500);
          }
          if (newLines.size) {
            setFresh(newLines);
            setTimeout(() => setFresh(new Set()), 2500);
          }
          if (moved.size) {
            setMoves(moved);
            setTimeout(() => setMoves(new Map()), 6000);
          }
          last.current = next;
          setBoard(next);
        }
      } catch {
        /* keep the last board */
      }
      const b = last.current;
      if (!stop) timer = setTimeout(poll, b.phase === "live" ? 3_000 : b.phase === "pre" ? 5_000 : 30_000);
    };
    timer = setTimeout(poll, 1_500);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [initial.scope]);

  const table = board.tables.find((t) => t.id === tab) ?? board.tables[0];
  const live = board.phase === "live";
  const toKo = board.kickoffAt ? Math.max(0, new Date(board.kickoffAt).getTime() - now) : 0;
  const mm = Math.floor(toKo / 60_000);
  const ss = Math.floor((toKo % 60_000) / 1000);
  const totalGoals = board.fixtures.reduce((s, f) => s + f.homeGoals + f.awayGoals, 0);

  if (board.phase === "none") {
    return (
      <div className="panel p-8 text-center">
        <h1 className="text-4xl">Nothing on right now</h1>
        <p className="mt-2 text-muted">When a {board.scope === "sim" ? "simulated matchday" : "gameweek"} is being played you can watch every score and the live table here.</p>
        <Link href="/matches" className="btn-primary mt-4 inline-flex px-5 py-2.5 text-sm">See matches</Link>
      </div>
    );
  }

  return (
    <div className="watch space-y-6">
      {/* Broadcast header */}
      <div className="relative overflow-hidden rounded-3xl border border-ink-700 bg-[#050607] p-5 sm:p-7">
        <div className="watch-sweep pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em]">
              {live && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" aria-hidden="true" />}
              <span className={live ? "text-danger" : "text-faint"}>{live ? "Live now" : board.phase === "pre" ? "Kick-off soon" : "Full time"}</span>
              {board.scope === "sim" && <span className="rounded bg-[#8fe3ff] px-1.5 py-0.5 text-[10px] text-[#04121a]">SIM</span>}
            </p>
            <h1 className="mt-1 text-4xl leading-none sm:text-6xl">{board.title}</h1>
            <p className="mt-2 text-sm text-muted">
              {board.fixtures.length} games · {totalGoals} goal{totalGoals === 1 ? "" : "s"} so far
              {board.scope === "sim" && " · results simulated from real form"}
            </p>
          </div>
          <div className="text-right">
            {board.phase === "pre" ? (
              <>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-faint">Kick-off in</p>
                <p className="font-display text-6xl font-black italic leading-none tabular-nums text-lime sm:text-7xl">
                  {mm}:{String(ss).padStart(2, "0")}
                </p>
              </>
            ) : (
              <p key={board.clock} className={`watch-clock font-display text-6xl font-black italic leading-none tabular-nums sm:text-8xl ${live ? "text-lime" : "text-fg"}`}>
                {board.clock ?? "—"}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Vidiprinter */}
        <section className="overflow-hidden rounded-2xl border border-ink-700 bg-black">
          <div className="flex items-center justify-between border-b border-white/10 bg-[#0b0d10] px-4 py-2">
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-lime">Vidiprinter</h2>
            {live && <span className="h-2 w-2 animate-pulse rounded-full bg-lime" aria-hidden="true" />}
          </div>
          <ol className="max-h-[420px] space-y-0 overflow-y-auto p-3 font-mono text-[13px] leading-relaxed" aria-live="polite">
            {board.feed.length === 0 && <li className="px-1 py-2 text-white/40">{board.phase === "pre" ? "Waiting for kick-off…" : "No goals or cards yet…"}</li>}
            {board.feed.map((l) => (
              <li key={l.key} className={`flex gap-2 rounded px-1 py-1 ${fresh.has(l.key) ? "vidi-in bg-lime/10" : ""} ${l.kind === "goal" || l.kind === "own_goal" ? "text-lime" : l.kind === "red" ? "text-danger" : "text-white/70"}`}>
                <span className="w-8 shrink-0 text-right text-white/40">{l.minute}&apos;</span>
                <span aria-hidden="true">{ICON[l.kind]}</span>
                <span className="min-w-0">
                  <span className="block font-bold uppercase">{l.score}</span>
                  <span className="block text-white/60">{l.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Live table */}
        <section className="rounded-2xl border border-ink-700 bg-ink-900">
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-4 py-3">
            <h2 className="mr-auto text-2xl">Live table</h2>
            {board.tables.length > 1 &&
              board.tables.map((t) => (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-full px-3 py-1 text-[11px] font-bold ${t.id === table?.id ? "bg-accent text-accent-ink" : "bg-ink-800 text-muted"}`}>
                  {t.name.replace(/ · (SIM|GW) ?\d+$/, "")}
                </button>
              ))}
          </div>
          {table ? <Table t={table} moves={moves} /> : <p className="p-4 text-sm text-muted">No matches on this matchday yet.</p>}
        </section>
      </div>

      {/* Every score */}
      <section>
        <h2 className="mb-3 text-2xl">All scores</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {board.fixtures.map((f) => (
            <Score key={f.id} f={f} goal={goals.has(f.id)} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function Score({ f, goal }: { f: WatchFixture; goal: boolean }) {
  const live = f.status === "LIVE";
  return (
    <li className={`relative overflow-hidden rounded-xl border bg-ink-900 px-3 py-2 transition-colors duration-700 ${goal ? "watch-goal border-lime" : live ? "border-danger/40" : "border-ink-700"}`}>
      {goal && <span className="watch-goal-tag absolute right-2 top-1 font-display text-sm font-black italic text-lime">GOAL!</span>}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
        <span className="flex min-w-0 items-center justify-end gap-1.5 text-right">
          <span className="truncate font-semibold">{f.home.name}</span>
          <span className="h-4 w-1.5 shrink-0 rounded-sm" style={{ background: f.home.colour }} aria-hidden="true" />
        </span>
        <span className={`min-w-[64px] rounded-md px-2 py-0.5 text-center font-display text-xl font-black italic tabular-nums ${live ? "bg-lime text-[#0a0d02]" : f.status === "FINISHED" ? "bg-white/15" : "bg-ink-800 text-muted"}`}>
          {f.status === "SCHEDULED" ? "v" : (
            <>
              <span key={`h${f.homeGoals}`} className="watch-digit inline-block">{f.homeGoals}</span>–<span key={`a${f.awayGoals}`} className="watch-digit inline-block">{f.awayGoals}</span>
            </>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="h-4 w-1.5 shrink-0 rounded-sm" style={{ background: f.away.colour }} aria-hidden="true" />
          <span className="truncate font-semibold">{f.away.name}</span>
        </span>
      </div>
    </li>
  );
}

function Table({ t, moves }: { t: WatchTable; moves: Map<string, number> }) {
  const rows = t.rows;
  return (
    <div className="p-3">
      {t.pot && <p className="mb-2 text-xs font-bold text-lime">{t.pot.replace(" pot", " Pot")} — winner takes it</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No one has entered yet.</p>
      ) : (
        <div className="relative" style={{ height: rows.length * ROW }}>
          {rows.map((r, i) => {
            const mv = moves.get(`${t.id}:${r.userId}`) ?? 0;
            return (
              <div
                key={r.userId}
                className={`absolute inset-x-0 flex items-center gap-3 rounded-xl border px-3 transition-transform duration-700 ease-out ${r.me ? "border-lime/70 bg-lime/10" : "border-ink-700 bg-ink-850"} ${mv > 0 ? "watch-up" : mv < 0 ? "watch-down" : ""}`}
                style={{ height: ROW - 6, transform: `translateY(${i * ROW}px)` }}
              >
                <span className="w-7 text-center font-display text-xl font-black italic tabular-nums">{r.rank}</span>
                <span className="w-4 text-xs font-black">{mv > 0 ? <span className="text-lime">▲</span> : mv < 0 ? <span className="text-danger">▼</span> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {r.name} {r.me && <span className="text-[10px] font-bold text-lime">YOU</span>}
                  </span>
                  {r.club && <span className="block truncate text-[11px] text-faint">{r.club}</span>}
                </span>
                <span className="font-display text-2xl font-black italic tabular-nums text-lime">{r.points}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
