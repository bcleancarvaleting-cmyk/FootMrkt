"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { projectedWins } from "@/domain/football/prizes";
import type { ReplayData } from "@/server/sim-replay";
import type { WatchBoard, WatchFixture, WatchLine, WatchPlayer, WatchTable, WatchTeam } from "@/server/watch";

/**
 * Watch live — the game in itself. Your team front and centre on a pitch with every player's points
 * moving as it happens, your total and rank, the live table sliding, a vidiprinter, and every
 * score tucked away below. Before kick-off it's the match sheet with countdowns; after full time a
 * finished simulated matchday can be watched again (same clock, or 2× / 4×).
 */
const ROW = 54;
const ICON: Record<WatchLine["kind"], string> = { goal: "⚽", own_goal: "⚽", yellow: "🟨", red: "🟥", pen_miss: "❌", time: "⏱" };

type Replay = ReplayData & { viewerId: string | null };
type View = Pick<WatchBoard, "title" | "phase" | "clock" | "added" | "fixtures" | "feed" | "tables" | "mine" | "scope"> & { progress: number };

export function WatchLive({ initial, gw = null, autoReplay = false }: { initial: WatchBoard; gw?: string | null; autoReplay?: boolean }) {
  const [board, setBoard] = useState(initial);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [replayT, setReplayT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Live polling (paused while watching a replay).
  useEffect(() => {
    if (replay) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let phase = initial.phase;
    const poll = async () => {
      try {
        const r = await fetch(`/api/watch?scope=${initial.scope}${gw ? `&gw=${gw}` : ""}`, { cache: "no-store" });
        if (r.ok && !stop) {
          const next = (await r.json()) as WatchBoard;
          phase = next.phase;
          setBoard(next);
        }
      } catch {
        /* keep the last board */
      }
      if (!stop) timer = setTimeout(poll, phase === "live" ? 3_000 : phase === "pre" ? 5_000 : 30_000);
    };
    timer = setTimeout(poll, 1_500);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [initial.scope, initial.phase, replay, gw]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Replay clock.
  useEffect(() => {
    if (!replay || !playing) return;
    let last = performance.now();
    const t = setInterval(() => {
      const n = performance.now();
      const dt = ((n - last) / 1000) * speed;
      last = n;
      setReplayT((x) => {
        const next = Math.min(replay.duration, x + dt);
        if (next >= replay.duration) setPlaying(false);
        return next;
      });
    }, 200);
    return () => clearInterval(t);
  }, [replay, playing, speed]);

  const startReplay = useCallback(async () => {
    if (!board.gameweekId) return;
    setLoadingReplay(true);
    try {
      const r = await fetch(`/api/watch/replay?gw=${board.gameweekId}`);
      if (r.ok) {
        setReplay((await r.json()) as Replay);
        setReplayT(0);
        setPlaying(true);
        setSpeed(1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } finally {
      setLoadingReplay(false);
    }
  }, [board.gameweekId]);

  // Opened from Results → "Watch game": start the replay straight away.
  useEffect(() => {
    if (!autoReplay || !initial.replay) return;
    const t = setTimeout(() => void startReplay(), 0);
    return () => clearTimeout(t);
  }, [autoReplay, initial.replay, startReplay]);

  const view: View = useMemo(() => (replay ? replayView(replay, replayT, board) : { ...board, progress: liveProgress(board) }), [replay, replayT, board]);

  if (board.phase === "none" && !replay) {
    return (
      <div className="panel p-8 text-center">
        <h1 className="text-4xl">Nothing on right now</h1>
        <p className="mt-2 text-muted">When a {board.scope === "sim" ? "simulated matchday" : "gameweek"} is being played you can watch your team and the live table here.</p>
        <Link href="/matches" className="btn-primary mt-4 inline-flex px-5 py-2.5 text-sm">See matches</Link>
      </div>
    );
  }

  const pre = view.phase === "pre";
  return (
    <div className="watch space-y-5">
      <Header view={view} replay={!!replay} now={now} board={board} />

      {replay && (
        <ReplayBar
          t={replayT}
          duration={replay.duration}
          playing={playing}
          speed={speed}
          onPlay={() => {
            if (replayT >= replay.duration) setReplayT(0);
            setPlaying((p) => !p);
          }}
          onSpeed={setSpeed}
          onSeek={(t) => setReplayT(t)}
          onExit={() => setReplay(null)}
        />
      )}

      {pre ? (
        <MatchSheet board={board} now={now} />
      ) : (
        <>
          <MyTeams teams={view.mine} enterHref={replay ? null : board.enterHref} />
          <Vidiprinter feed={view.feed} live={view.phase === "live"} />
          <LiveTables tables={view.tables} replay={replay} replayView={view} />
        </>
      )}

      {view.phase === "ft" && !replay && board.replay && (
        <button type="button" onClick={startReplay} disabled={loadingReplay} className="btn-glow watch-btn w-full px-6 py-4 font-display text-xl font-black italic">
          {loadingReplay ? "Loading replay…" : "▶ Watch the replay"}
        </button>
      )}

      <details className="group rounded-2xl border border-ink-700 bg-ink-900">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-bold">
          <span>
            All scores <span className="text-sm font-normal text-muted">· {view.fixtures.length} games</span>
          </span>
          <span className="text-muted transition group-open:rotate-180">▾</span>
        </summary>
        <ul className="grid gap-2 p-3 pt-0 sm:grid-cols-2 lg:grid-cols-3">
          {view.fixtures.map((f) => (
            <Score key={f.id} f={f} />
          ))}
        </ul>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ header */

function Header({ view, replay, now, board }: { view: View; replay: boolean; now: number; board: WatchBoard }) {
  const live = view.phase === "live";
  const goals = view.fixtures.reduce((s, f) => s + f.homeGoals + f.awayGoals, 0);
  return (
    <div className="relative overflow-hidden rounded-3xl border border-ink-700 bg-[#050607] p-4 sm:p-6">
      {live && <div className="watch-sweep pointer-events-none absolute inset-0" aria-hidden="true" />}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
            {replay ? (
              <span className="rounded bg-white px-1.5 py-0.5 text-[#050607]">Replay</span>
            ) : live ? (
              <span className="flex items-center gap-1.5 text-danger">
                <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" /> Live
              </span>
            ) : view.phase === "pre" ? (
              <span className="text-lime">Match sheet</span>
            ) : (
              <span className="text-faint">Full time</span>
            )}
            {view.scope === "sim" && <span className="rounded bg-[#8fe3ff] px-1.5 py-0.5 text-[#04121a]">SIM</span>}
          </p>
          <h1 className="mt-1 truncate text-3xl leading-none sm:text-5xl">{view.title}</h1>
          <p className="mt-1.5 text-xs text-muted">
            {view.fixtures.length} games · <b className="text-fg">{goals}</b> goal{goals === 1 ? "" : "s"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {view.phase === "pre" ? (
            <Countdown label="Kick-off in" to={board.kickoffAt} now={now} />
          ) : (
            <>
              <p key={view.clock} className={`watch-clock font-display text-5xl font-black italic leading-none tabular-nums sm:text-7xl ${live ? "text-lime" : "text-fg"}`}>{view.clock ?? "—"}</p>
              {view.added && (
                <p key={`a${view.added}`} className="watch-board mt-1.5 inline-flex items-center gap-1.5 rounded-md border-2 border-[#ff3b3b] bg-black px-2 py-0.5 font-mono text-base font-black text-[#ff3b3b] shadow-[0_0_18px_rgba(255,59,59,0.35)]">
                  +{view.added}
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/80">added</span>
                </p>
              )}
            </>
          )}
        </div>
      </div>
      {view.phase !== "pre" && (
        <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className="h-full rounded-full bg-lime transition-[width] duration-700 ease-linear" style={{ width: `${Math.round(view.progress * 100)}%` }} />
          <span className="absolute left-1/2 top-0 h-full w-px bg-white/30" />
        </div>
      )}
    </div>
  );
}

function Countdown({ label, to, now }: { label: string; to: string | null; now: number }) {
  const ms = to ? Math.max(0, new Date(to).getTime() - now) : 0;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">{label}</p>
      <p className="font-display text-5xl font-black italic leading-none tabular-nums text-lime sm:text-6xl">
        {m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, "0")}`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ replay bar */

function ReplayBar({ t, duration, playing, speed, onPlay, onSpeed, onSeek, onExit }: { t: number; duration: number; playing: boolean; speed: number; onPlay: () => void; onSpeed: (n: number) => void; onSeek: (t: number) => void; onExit: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-lime/30 bg-lime/[0.04] px-3 py-2.5">
      <button type="button" onClick={onPlay} className="btn-glow h-10 w-10 !p-0 text-lg" aria-label={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <input type="range" min={0} max={duration} step={0.5} value={t} onChange={(e) => onSeek(Number(e.target.value))} className="min-w-0 flex-1 accent-[#8fe3ff]" aria-label="Replay position" />
      <div className="flex overflow-hidden rounded-full border border-white/15 text-xs font-bold">
        {[1, 2, 4].map((n) => (
          <button key={n} type="button" onClick={() => onSpeed(n)} className={`px-2.5 py-1 ${speed === n ? "bg-lime/15 text-lime" : "text-muted"}`}>
            {n}×
          </button>
        ))}
      </div>
      <button type="button" onClick={onExit} className="text-xs font-bold text-muted underline">
        Close replay
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ vidiprinter */

function Vidiprinter({ feed, live }: { feed: WatchLine[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const latest = feed[0];
  const rest = feed.slice(1, open ? 40 : 4);
  return (
    <section className="overflow-hidden rounded-2xl border border-ink-700 bg-black">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0b0d10] px-4 py-1.5">
        <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-lime">Vidiprinter</h2>
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime" aria-hidden="true" />}
      </div>
      <div className="p-3 font-mono" aria-live="polite">
        {latest ? (
          <div key={latest.key} className={`vidi-in flex gap-2 ${lineTone(latest)}`}>
            <span className="w-9 shrink-0 text-right text-white/50">{Math.floor(latest.minute)}&apos;</span>
            <span aria-hidden="true">{ICON[latest.kind]}</span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold uppercase leading-snug">{latest.score}</span>
              {latest.text && <span className="block text-[13px] text-white/70">{latest.text}</span>}
            </span>
          </div>
        ) : (
          <p className="text-[13px] text-white/40">Waiting for the first goal…</p>
        )}
        {rest.length > 0 && (
          <ol className={`mt-2 space-y-1 border-t border-white/10 pt-2 text-[12px] ${open ? "max-h-72 overflow-y-auto" : ""}`}>
            {rest.map((l) => (
              <li key={l.key} className={`flex gap-2 ${lineTone(l)} opacity-80`}>
                <span className="w-9 shrink-0 text-right text-white/40">{Math.floor(l.minute)}&apos;</span>
                <span aria-hidden="true">{ICON[l.kind]}</span>
                <span className="min-w-0 truncate">
                  <b className="uppercase">{l.score}</b>
                  {l.text && <span className="text-white/50"> · {l.text.replace(/^GOAL! /, "")}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
        {feed.length > 4 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
            {open ? "Show less ▴" : `Show all ${feed.length} ▾`}
          </button>
        )}
      </div>
    </section>
  );
}

const lineTone = (l: WatchLine) => (l.kind === "goal" || l.kind === "own_goal" ? "text-lime" : l.kind === "red" ? "text-danger" : l.kind === "time" ? "text-[#8fe3ff]" : "text-white/80");

/* ------------------------------------------------------------------ your team */

function MyTeams({ teams, enterHref }: { teams: WatchTeam[]; enterHref: string | null }) {
  const [pick, setPick] = useState(0);
  if (!teams.length) {
    return (
      <section className="rounded-2xl border border-dashed border-ink-600 bg-ink-900 p-5 text-center">
        <p className="font-display text-2xl font-black uppercase italic">You&apos;re not in this one</p>
        <p className="mt-1 text-sm text-muted">Watch the table and the vidiprinter — and get your seven in next time.</p>
        {enterHref && <Link href={enterHref} className="btn-primary mt-3 inline-flex px-5 py-2.5 text-sm">Pick my team</Link>}
      </section>
    );
  }
  const team = teams[Math.min(pick, teams.length - 1)];
  return (
    <section>
      {teams.length > 1 && (
        <div className="mb-2 flex gap-1 overflow-x-auto">
          {teams.map((t, i) => (
            <button key={t.entryId} type="button" onClick={() => setPick(i)} className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${i === pick ? "bg-accent text-accent-ink" : "bg-ink-800 text-muted"}`}>
              {t.competition.replace(/ · (SIM|GW) ?\d+$/, "")}
            </button>
          ))}
        </div>
      )}
      <TeamCard team={team} mine />
    </section>
  );
}

export function TeamCard({ team, mine = false, label }: { team: WatchTeam; mine?: boolean; label?: string }) {
  const prevRank = useRef(team.rank);
  const [rankMove, setRankMove] = useState(0);
  useEffect(() => {
    if (prevRank.current !== team.rank) {
      setRankMove(prevRank.current - team.rank);
      prevRank.current = team.rank;
      const t = setTimeout(() => setRankMove(0), 4000);
      return () => clearTimeout(t);
    }
  }, [team.rank]);
  const starters = team.players.filter((p) => !p.sub);
  const subs = team.players.filter((p) => p.sub);
  const lines: Array<WatchPlayer["position"]> = ["ATT", "MID", "DEF", "GK"];
  return (
    <div className={`overflow-hidden rounded-3xl border ${mine ? "border-lime/50" : "border-ink-700"} bg-ink-900`}>
      <div className="flex items-end justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">{label ?? (mine ? "Your team" : team.manager)}</p>
          <p className="truncate font-display text-xl font-black uppercase italic leading-tight">{team.competition.replace(/ · (SIM|GW) ?\d+$/, "")}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm">
            <span className="text-muted">Position</span>
            <b className="font-display text-xl font-black italic tabular-nums">#{team.rank || "–"}</b>
            <span className="text-faint">of {team.entries}</span>
            {rankMove !== 0 && <span className={`rank-pop text-sm font-black ${rankMove > 0 ? "text-lime" : "text-danger"}`}>{rankMove > 0 ? `▲${rankMove}` : `▼${-rankMove}`}</span>}
          </p>
        </div>
        <div className="text-right">
          <p key={team.points} className="pts-pop font-display text-6xl font-black italic leading-none tabular-nums text-lime">{team.points}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">points</p>
        </div>
      </div>
      <div className="pitch relative mx-3 mb-3 space-y-3 rounded-2xl px-2 py-4">
        <span className="pointer-events-none absolute inset-x-6 top-1/2 h-px bg-white/15" aria-hidden="true" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" aria-hidden="true" />
        {lines.map((pos) => {
          const row = starters.filter((p) => p.position === pos);
          if (!row.length) return null;
          return (
            <div key={pos} className="relative flex justify-center gap-2 sm:gap-6">
              {row.map((p) => (
                <PlayerToken key={p.playerId} p={p} />
              ))}
            </div>
          );
        })}
      </div>
      {subs.length > 0 && (
        <div className="flex items-center gap-3 border-t border-ink-700 px-4 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">Sub</span>
          {subs.map((p) => (
            <span key={p.playerId} className="flex items-center gap-2 text-sm">
              <span className="h-3 w-1.5 rounded-sm" style={{ background: p.colour }} aria-hidden="true" />
              <b>{p.name}</b>
              <span className="tabular-nums text-muted">{p.points} pts</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerToken({ p }: { p: WatchPlayer }) {
  const prev = useRef(p.points);
  const [gain, setGain] = useState<{ key: number; d: number } | null>(null);
  useEffect(() => {
    const d = Math.round((p.points - prev.current) * 10) / 10;
    prev.current = p.points;
    if (d !== 0) {
      setGain({ key: Date.now(), d });
      const t = setTimeout(() => setGain(null), 2600);
      return () => clearTimeout(t);
    }
  }, [p.points]);
  const shown = p.captain ? Math.round(p.points * 2 * 10) / 10 : p.points;
  return (
    <div className={`relative flex w-[76px] flex-col items-center text-center sm:w-24 ${gain && gain.d > 0 ? "token-glow" : ""}`}>
      {gain && (
        <span key={gain.key} className={`pts-float pointer-events-none absolute -top-3 z-10 rounded-full px-1.5 text-xs font-black ${gain.d > 0 ? "bg-lime text-[#0a0d02]" : "bg-danger text-white"}`}>
          {gain.d > 0 ? `+${gain.d}` : gain.d}
        </span>
      )}
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/80 text-[11px] font-black text-white shadow-lg sm:h-12 sm:w-12" style={{ background: p.colour }}>
        {p.club}
        {p.captain && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#adfc07] text-[10px] font-black text-[#0a0d02]">C</span>}
        {p.playing && <span className="absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 animate-pulse rounded-full border border-black bg-danger" title="Playing now" />}
      </span>
      <span className="mt-1 w-full truncate rounded bg-black/60 px-1 text-[11px] font-bold text-white">{p.name.split(" ").slice(-1)[0]}</span>
      <span className={`mt-0.5 rounded-md px-1.5 font-display text-base font-black italic tabular-nums ${shown > 0 ? "bg-lime text-[#0a0d02]" : shown < 0 ? "bg-danger text-white" : "bg-black/50 text-white/70"}`}>{shown}</span>
      <span className="mt-0.5 h-3 text-[10px] leading-3">
        {"⚽".repeat(Math.min(p.goals, 3))}
        {"🅰️".repeat(Math.min(p.assists, 2))}
        {p.yellow > 0 && "🟨"}
        {p.red > 0 && "🟥"}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ live tables */

function LiveTables({ tables, replay, replayView }: { tables: WatchTable[]; replay: Replay | null; replayView: View }) {
  const [tab, setTab] = useState(tables[0]?.id ?? "");
  const table = tables.find((t) => t.id === tab) ?? tables[0];
  if (!table) return null;
  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-4 py-3">
        <h2 className="mr-auto text-2xl">Live table</h2>
        {tables.length > 1 &&
          tables.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-full px-3 py-1 text-[11px] font-bold ${t.id === table.id ? "bg-accent text-accent-ink" : "bg-ink-800 text-muted"}`}>
              {t.name.replace(/ · (SIM|GW) ?\d+$/, "")}
            </button>
          ))}
      </div>
      <Table t={table} replay={replay} replayView={replayView} />
    </section>
  );
}

function Table({ t, replay, replayView }: { t: WatchTable; replay: Replay | null; replayView: View }) {
  const prev = useRef(new Map<string, number>());
  const [moves, setMoves] = useState(new Map<string, number>());
  const [open, setOpen] = useState<string | null>(null);
  const [liveTeam, setLiveTeam] = useState<WatchTeam | null>(null);
  useEffect(() => {
    const m = new Map<string, number>();
    for (const r of t.rows) {
      const o = prev.current.get(r.entryId);
      if (o && o !== r.rank) m.set(r.entryId, o - r.rank);
    }
    prev.current = new Map(t.rows.map((r) => [r.entryId, r.rank]));
    if (m.size) {
      const a = setTimeout(() => setMoves(m), 0);
      const x = setTimeout(() => setMoves(new Map()), 3000);
      return () => {
        clearTimeout(a);
        clearTimeout(x);
      };
    }
  }, [t.rows]);

  // An opened team: from the replay, or live from the server (only once entries have closed).
  useEffect(() => {
    if (!open || replay) return;
    let stop = false;
    const load = async () => {
      const r = await fetch(`/api/watch/team?entry=${open}`, { cache: "no-store" });
      if (r.ok && !stop) setLiveTeam((await r.json()) as WatchTeam);
    };
    load();
    const i = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(i);
    };
  }, [open, replay]);
  const team = !open ? null : replay ? replayTeam(replay, replayView, open) : liveTeam?.entryId === open ? liveTeam : null;

  const canOpen = t.locked || !!replay;
  const rows = t.rows;
  // What each manager would win if it ended now (ties split the £, everyone tied on a pack place gets one).
  const wins = t.locked && rows.some((r) => r.points > 0) ? projectedWins(rows, t.prizes ?? []) : new Map<string, { cashMinor: number; packs: string[] }>();
  const settled = t.status === "SETTLED";
  return (
    <div className="p-3">
      {t.pot && <p className="mb-2 text-xs font-black text-lime">{t.pot.replace(" pot", " Pot")} — winner takes it, ties split</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No one has entered yet.</p>
      ) : (
        <div className="relative" style={{ height: rows.length * ROW }}>
          {rows.map((r, i) => {
            const mv = moves.get(r.entryId) ?? 0;
            return (
              <button
                key={r.entryId}
                type="button"
                disabled={!canOpen}
                onClick={() => setOpen((o) => (o === r.entryId ? null : r.entryId))}
                className={`absolute inset-x-0 flex items-center gap-3 rounded-xl border px-3 text-left transition-transform duration-700 ease-out ${r.me ? "border-lime/70 bg-lime/10" : "border-ink-700 bg-ink-850"} ${open === r.entryId ? "ring-2 ring-[#8fe3ff]" : ""} ${mv > 0 ? "watch-up" : mv < 0 ? "watch-down" : ""}`}
                style={{ height: ROW - 6, transform: `translateY(${i * ROW}px)` }}
              >
                <span className={`w-8 text-center font-display text-2xl font-black italic tabular-nums ${r.rank === 1 ? "text-gold" : ""}`}>{r.rank}</span>
                <span className="w-5 text-xs font-black">{mv > 0 ? <span className="text-lime">▲</span> : mv < 0 ? <span className="text-danger">▼</span> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {r.house && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/icons/icon-192.png" alt="" width={16} height={16} className="mr-1 inline-block h-4 w-4 rounded align-[-2px]" />
                    )}
                    {r.name} {r.me && <span className="text-[10px] font-bold text-lime">YOU</span>}
                  </span>
                  {r.house ? (
                    <span className="block truncate text-[11px] font-bold text-lime" title="The MATCHX team plays for fun — never wins prizes">MATCHX · playing for bragging rights</span>
                  ) : (
                    r.club && <span className="block truncate text-[11px] text-faint">{r.club}</span>
                  )}
                </span>
                {!r.house && wins.get(r.userId) && <WinChip w={wins.get(r.userId)!} settled={settled} />}
                <span key={r.points} className="pts-pop font-display text-2xl font-black italic tabular-nums text-lime">{r.points}</span>
              </button>
            );
          })}
        </div>
      )}
      {canOpen ? (
        <p className="mt-2 text-center text-[11px] text-faint">Tap a manager to see their team</p>
      ) : (
        <p className="mt-2 text-center text-[11px] text-faint">Teams are revealed when entries close</p>
      )}
      {open && team && (
        <div className="mt-3">
          <TeamCard team={team} />
        </div>
      )}
    </div>
  );
}

/** "Wins £10" / "Wins £5 + Gold pack" next to a manager on the live table — if it ended now. */
function WinChip({ w, settled }: { w: { cashMinor: number; packs: string[] }; settled: boolean }) {
  const parts = [w.cashMinor > 0 ? `£${(w.cashMinor / 100).toFixed(w.cashMinor % 100 ? 2 : 0)}` : null, ...w.packs.map((p) => (/pack/i.test(p) ? p : `${p} pack`))].filter(Boolean);
  return (
    <span className="shrink-0 rounded-full border border-[#f0cb5a]/60 bg-[#f0cb5a]/10 px-2 py-0.5 text-right text-[10px] font-black uppercase leading-tight tracking-wide text-[#f0cb5a]" title={settled ? "Won" : "What they'd win if it ended now — ties split the £, everyone tied gets the pack"}>
      {settled ? "Won" : "Wins"} {parts.join(" + ")}
    </span>
  );
}

/* ------------------------------------------------------------------ match sheet */

function MatchSheet({ board, now }: { board: WatchBoard; now: number }) {
  const closing = board.locksAt && new Date(board.locksAt).getTime() > now;
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">{closing ? <Countdown label="Entries close in" to={board.locksAt} now={now} /> : <p className="font-display text-2xl font-black uppercase italic text-danger">Entries closed</p>}</div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-faint">Managers in</p>
          <p className="font-display text-5xl font-black italic leading-none tabular-nums">{board.tables.reduce((s, t) => s + t.rows.length, 0)}</p>
        </div>
      </div>
      {board.mine.length ? (
        <MyTeams teams={board.mine} enterHref={null} />
      ) : (
        <section className="rounded-2xl border border-lime/40 bg-lime/5 p-5 text-center">
          <p className="font-display text-2xl font-black uppercase italic">Get your seven in</p>
          <p className="mt-1 text-sm text-muted">Pick your team before entries close, then watch it play out live here.</p>
          {board.enterHref && <Link href={board.enterHref} className="btn-primary mt-3 inline-flex px-5 py-2.5 text-sm">Pick my team</Link>}
        </section>
      )}
      {board.tables.map((t) => (
        <div key={t.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <p className="flex items-center justify-between font-bold">
            {t.name.replace(/ · (SIM|GW) ?\d+$/, "")}
            {t.pot && <span className="text-sm font-black text-lime">{t.pot.replace(" pot", " Pot")}</span>}
          </p>
          <p className="mt-1 text-xs text-muted">{t.rows.length ? t.rows.map((r) => r.name).join(" · ") : "No one in yet"}</p>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ scores */

function Score({ f }: { f: WatchFixture }) {
  const live = f.status === "LIVE";
  return (
    <li className={`rounded-xl border bg-ink-850 px-3 py-2 ${live ? "border-danger/40" : "border-ink-700"}`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
        <span className="flex min-w-0 items-center justify-end gap-1.5 text-right">
          <span className="truncate font-semibold">{f.home.name}</span>
          <span className="h-4 w-1.5 shrink-0 rounded-sm" style={{ background: f.home.colour }} aria-hidden="true" />
        </span>
        <span className={`min-w-[60px] rounded-md px-2 py-0.5 text-center font-display text-lg font-black italic tabular-nums ${live ? "bg-lime text-[#0a0d02]" : f.status === "FINISHED" ? "bg-white/15" : "bg-ink-800 text-muted"}`}>
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

/* ------------------------------------------------------------------ live/replay → view */

function liveProgress(b: WatchBoard) {
  if (b.phase === "ft") return 1;
  const c = b.clock ?? "";
  if (c === "HT") return 0.5;
  const m = /^(\d+)(?:\+(\d+))?'/.exec(c);
  return m ? Math.min(1, Number(m[1]) / 90) : 0;
}

function replayView(r: Replay, t: number, board: WatchBoard): View {
  let i = 0;
  while (i + 1 < r.frames.length && r.frames[i + 1].t <= t) i++;
  const f = r.frames[i];
  const done = i === r.frames.length - 1 && t >= f.t;
  const minute = f.minute;
  const fixtures: WatchFixture[] = r.fixtures.map((x, k) => ({ ...x, homeGoals: f.s[2 * k], awayGoals: f.s[2 * k + 1], status: done ? "FINISHED" : "LIVE" }));
  // Vidiprinter up to this minute, with the running score each event made.
  const shown = r.events.filter((e) => e.minute <= minute);
  const tally = new Map<number, [number, number]>();
  const feed: WatchLine[] = shown.map((e, k) => {
    const sc = tally.get(e.fixture) ?? [0, 0];
    if (e.type === "goal" || e.type === "own_goal") sc[e.side === "home" ? 0 : 1]++;
    tally.set(e.fixture, sc);
    const fx = r.fixtures[e.fixture];
    const team = e.side === "home" ? fx.home.name : fx.away.name;
    const text =
      e.type === "goal" ? `GOAL! ${e.player} (${team})${e.assist ? ` — assisted by ${e.assist}` : ""}` : e.type === "own_goal" ? `OWN GOAL! ${e.player}` : e.type === "yellow" ? `Yellow card: ${e.player} (${team})` : e.type === "red" ? `SENT OFF! ${e.player} (${team})` : `Penalty ${e.saved ? "saved" : "missed"}: ${e.player} (${team})`;
    return { key: `r${k}`, minute: e.minute, kind: e.type, text, score: `${fx.home.name} ${sc[0]}–${sc[1]} ${fx.away.name}` };
  });
  const clockIdx = r.frames.findIndex((x) => x.clock === "HT");
  if (i >= clockIdx) feed.push({ key: "rt-ht", minute: 45.2, kind: "time", text: "", score: "HALF TIME" });
  if (done) feed.push({ key: "rt-ft", minute: 90.2, kind: "time", text: "", score: "FULL TIME" });
  feed.sort((a, b) => b.minute - a.minute || b.key.localeCompare(a.key));

  const tables: WatchTable[] = r.tables.map((tb) => {
    const sorted = [...tb.rows].map((row) => ({ ...row, points: f.e[row.entryId] ?? 0 })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    let rank = 0;
    const rows = sorted.map((row, k) => {
      if (k === 0 || row.points !== sorted[k - 1].points) rank = k + 1;
      return { ...row, rank, me: row.userId === r.viewerId };
    });
    return { id: tb.id, name: tb.name, pot: tb.pot, prizes: tb.prizes ?? [], status: done ? "SETTLED" : "PROVISIONAL", locked: true, rows };
  });
  const view: View = { scope: "sim", title: r.title, phase: done ? "ft" : "live", clock: f.clock, added: f.added, fixtures, feed, tables, mine: [], progress: Math.min(1, t / r.duration) };
  view.mine = Object.entries(r.teams)
    .filter(([, tm]) => tm.userId === r.viewerId)
    .map(([entryId]) => replayTeam(r, view, entryId))
    .filter((x): x is WatchTeam => !!x);
  void board;
  return view;
}

function replayTeam(r: Replay, v: View, entryId: string): WatchTeam | null {
  const tm = r.teams[entryId];
  if (!tm) return null;
  let i = 0;
  const clock = v.clock;
  while (i + 1 < r.frames.length && r.frames[i].clock !== clock) i++;
  const f = r.frames[i];
  const row = v.tables.find((t) => t.id === tm.competitionId)?.rows.find((x) => x.entryId === entryId);
  const upto = r.events.filter((e) => e.minute <= f.minute);
  return {
    entryId,
    competitionId: tm.competitionId,
    competition: tm.competition,
    manager: tm.manager,
    club: tm.club,
    formation: tm.formation,
    points: row?.points ?? 0,
    rank: row?.rank ?? 0,
    entries: r.tables.find((t) => t.id === tm.competitionId)?.rows.length ?? 0,
    players: tm.players.map((p) => ({
      ...p,
      points: f.p[p.playerId] ?? 0,
      goals: upto.filter((e) => e.type === "goal" && e.playerId === p.playerId).length,
      assists: upto.filter((e) => e.type === "goal" && e.assistId === p.playerId).length,
      yellow: upto.filter((e) => e.type === "yellow" && e.playerId === p.playerId).length,
      red: upto.filter((e) => e.type === "red" && e.playerId === p.playerId).length,
      minutes: f.minute,
      playing: v.phase === "live",
    })),
  };
}
