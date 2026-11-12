"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LiveBoard, LiveFixture } from "@/server/live";

const LEAGUES: Array<[string, string]> = [
  ["EPL", "Premier League"],
  ["CHA", "Championship"],
  ["LG1", "League One"],
  ["LG2", "League Two"],
];

/** Matchday Live: every score, your live points and rank in each match, and your players' points as they happen. */
export function LiveCentre({ initial, signedIn }: { initial: LiveBoard; signedIn: boolean }) {
  const [board, setBoard] = useState(initial);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    let last = initial;
    const poll = async () => {
      try {
        const r = await fetch("/api/live", { cache: "no-store" });
        if (r.ok && !stop) {
          const next = (await r.json()) as LiveBoard;
          const before = new Map(last.fixtures.map((f) => [f.id, `${f.homeGoals}-${f.awayGoals}`]));
          const moved = new Set(next.fixtures.filter((f) => before.has(f.id) && before.get(f.id) !== `${f.homeGoals}-${f.awayGoals}`).map((f) => f.id));
          const oldPts = new Map((last.mine?.players ?? []).map((p) => [p.playerId, p.points]));
          for (const p of next.mine?.players ?? []) if (oldPts.has(p.playerId) && oldPts.get(p.playerId) !== p.points) moved.add(p.playerId);
          if (moved.size) {
            setChanged(moved);
            setTimeout(() => setChanged(new Set()), 4000);
          }
          last = next;
          setBoard(next);
        }
      } catch {
        /* keep the last numbers */
      }
      if (!stop) timer = setTimeout(poll, last.liveCount > 0 ? 15_000 : 30_000);
    };
    timer = setTimeout(poll, 15_000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [initial]);

  const live = board.liveCount > 0;
  const updated = new Date(board.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/London" });
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-2 text-lime">
            {live && <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />}
            {live ? `${board.liveCount} match${board.liveCount === 1 ? "" : "es"} live` : "Matchday"}
          </p>
          <h1 className="mt-1 text-4xl leading-none sm:text-5xl">Matchday Live</h1>
        </div>
        <p className="text-xs text-faint" aria-live="polite">Updated {updated} · refreshes by itself</p>
      </div>

      {board.mine ? (
        <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-2">
            <h2 className="text-2xl">Your matches</h2>
            {board.mine.entries.map((e) => (
              <Link key={e.competitionId} href={`/competitions/${e.competitionId}`} className="flex items-center justify-between gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4 transition hover:border-accent/60">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{e.name}</span>
                  <span className="text-xs text-muted">
                    Live rank <b className="text-fg">#{e.rank}</b> of {e.entries}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-display text-4xl font-black italic leading-none tabular-nums text-lime">{e.points}</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">pts</span>
                </span>
              </Link>
            ))}
          </div>
          <div>
            <h2 className="mb-2 text-2xl">Your players</h2>
            <ul className="divide-y divide-ink-700 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
              {board.mine.players.map((p) => (
                <li key={p.playerId} className={`flex items-center gap-3 px-4 py-2.5 transition-colors duration-700 ${changed.has(p.playerId) ? "bg-accent/15" : ""}`}>
                  <span className="w-2">{p.live && <span className="block h-2 w-2 animate-pulse rounded-full bg-danger" title="Playing now" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {p.name} {p.captain && <span className="ml-1 rounded bg-accent px-1 text-[10px] font-black text-accent-ink">C</span>}
                    </span>
                    <span className="text-xs text-faint">
                      {p.club}
                      {p.minutes > 0 ? ` · ${p.minutes}'` : " · yet to play"}
                      {p.goals > 0 && ` · ${"⚽".repeat(Math.min(p.goals, 4))}`}
                      {p.assists > 0 && ` · 🅰️${p.assists > 1 ? `×${p.assists}` : ""}`}
                    </span>
                  </span>
                  <span className={`font-display text-2xl font-black italic tabular-nums ${p.points > 0 ? "text-lime" : p.points < 0 ? "text-danger" : "text-faint"}`}>{p.points}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-faint">Points before captain and boosters. Your match totals above include them.</p>
          </div>
        </section>
      ) : (
        <section className="panel p-5 text-sm text-muted">
          {signedIn ? (
            <>Your live points show here once your squad is locked in for a match. <Link href="/matches" className="text-lime underline">Pick your seven</Link>.</>
          ) : (
            <>
              <Link href="/login" className="text-lime underline">Log in</Link> to follow your players&apos; points live.
            </>
          )}
        </section>
      )}

      {board.fixtures.length === 0 ? (
        <p className="panel p-5 text-sm text-muted">No matches today. Scores appear here the moment games kick off.</p>
      ) : (
        LEAGUES.map(([code, name]) => {
          const games = board.fixtures.filter((f) => f.league === code);
          if (!games.length) return null;
          return (
            <section key={code}>
              <h2 className="mb-2 text-2xl">{name}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {games.map((f) => (
                  <Fixture key={f.id} f={f} flash={changed.has(f.id)} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function Fixture({ f, flash }: { f: LiveFixture; flash: boolean }) {
  const live = f.status === "LIVE";
  const ko = new Date(f.kickoffAt).toLocaleTimeString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const side = (t: LiveFixture["home"], goals: number | null) => (
    <span className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-4 w-1.5 shrink-0 rounded-sm" style={{ background: t.colour }} aria-hidden="true" />
        <span className="truncate font-semibold">{t.name}</span>
      </span>
      {f.status !== "SCHEDULED" && <span className="font-display text-2xl font-black italic tabular-nums">{goals ?? 0}</span>}
    </span>
  );
  return (
    <li className={`rounded-2xl border bg-ink-900 p-4 transition-colors duration-700 ${live ? "border-danger/50" : "border-ink-700"} ${flash ? "!border-accent bg-accent/10" : ""}`}>
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em]">
        {live ? (
          <span className="flex items-center gap-1.5 text-danger">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" aria-hidden="true" /> Live {f.clock}
          </span>
        ) : f.status === "FINISHED" ? (
          <span className="text-faint">Full time</span>
        ) : f.status === "POSTPONED" ? (
          <span className="text-warn">Postponed</span>
        ) : (
          <span className="text-faint">{ko}</span>
        )}
        {flash && <span className="text-lime">GOAL!</span>}
      </div>
      <div className="space-y-1">
        {side(f.home, f.homeGoals)}
        {side(f.away, f.awayGoals)}
      </div>
    </li>
  );
}
