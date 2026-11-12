import Link from "next/link";
import { MatchCard } from "@/components/match-card";
import { SimBadge } from "@/components/sim-badge";
import { SimTickerScope, TickerMode } from "@/components/scores-ticker";
import { Countdown } from "@/components/countdown";
import { EmptyState } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { podiums } from "@/server/competitions";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { footballSport } from "@/server/gameweeks";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Matches" };

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ gw?: string }> }) {
  const user = await requireUser();
  const sport = await footballSport();
  const { gw: gwParam } = await searchParams;
  // Real gameweeks and simulated matchdays, in date order; the tabs show the last 3 played and what's next.
  const all = await db.gameweek.findMany({ where: { sportId: sport.id }, orderBy: [{ startsAt: "asc" }] });
  const settled = all.filter((g) => g.status === "SETTLED");
  const gameweeks = [...settled.slice(-3), ...all.filter((g) => g.status !== "SETTLED").slice(0, 7)];
  const gw = all.find((g) => g.id === gwParam) ?? all.find((g) => g.status !== "SETTLED") ?? settled[settled.length - 1];
  if (!gw) return <EmptyState title="No matches yet">An admin needs to open the first gameweek.</EmptyState>;

  const [comps, fixtures, paidEntry] = await Promise.all([
    db.competition.findMany({
      where: { gameweekId: gw.id },
      include: { entries: { where: { userId: user.id } }, _count: { select: { entries: true } } },
      orderBy: [{ entryFeeMinor: "asc" }, { name: "asc" }],
    }),
    db.fixture.findMany({
      where: { gameweekId: gw.id },
      include: { homeClub: { include: { league: true } }, awayClub: true },
      orderBy: [{ kickoffAt: "asc" }, { providerFixtureId: "asc" }],
    }),
    isEnabled("PAID_ENTRY"),
  ]);
  const results = await podiums(comps.filter((c) => c.status === "SETTLED").map((c) => c.id));
  const byLeague = new Map<string, typeof fixtures>();
  for (const f of fixtures) byLeague.set(f.homeClub.league.name, [...(byLeague.get(f.homeClub.league.name) ?? []), f]);
  const locksAt = comps[0]?.locksAt;
  const open = gw.status === "OPEN" || gw.status === "UPCOMING";

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{gw.simulated ? "Simulated matchday" : `${gw.season} season`}</p>
          <h1 className="mt-1 flex items-center gap-3 text-4xl leading-none sm:text-5xl">
            {gw.simulated ? <>Matchday {gw.number} <SimBadge className="text-xs" /></> : <>Gameweek {gw.number}</>}
          </h1>
          {gw.simulated && (
            <p className="mt-2 max-w-xl rounded-lg border border-[#8fe3ff]/40 bg-[#8fe3ff]/5 px-3 py-2 text-sm text-muted">
              These games aren&apos;t real football: the results are <b className="text-fg">simulated from each player&apos;s real form and value</b>, and play out live on Matchday Live — goals, assists and cards as they happen. You can use cards that are already in a real squad. Points count in these matches only, not in real stats or the Mega League.
            </p>
          )}
          {gw.simulated ? <SimTickerScope /> : <TickerMode mode="matches" />}
          {gw.simulated && gw.status === "SETTLED" && (
            <Link href={`/watch?gw=${gw.id}`} className="btn-glow mt-3 px-5 py-2.5 text-xs">
              ▶ Watch the replay
            </Link>
          )}
          {gw.simulated && gw.status !== "SETTLED" && (
            <Link href="/watch" className="btn-glow watch-btn mt-3 px-5 py-2.5 text-xs">
              <span className="live-dot" aria-hidden="true" /> {gw.status === "OPEN" || gw.status === "UPCOMING" ? "Watch the sim live" : "Watch live sim now"}
            </Link>
          )}
          <p className="mt-2 text-sm text-muted">
            {open && locksAt ? (
              <>
                Squads lock in <Countdown to={locksAt.toISOString()} className="font-bold text-lime" /> · {fmtDate(locksAt)} — 10 minutes before the first kick-off
              </>
            ) : open ? (
              <>Kick-off {fmtDate(gw.startsAt, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>
            ) : gw.status === "SETTLED" ? (
              "All matches settled"
            ) : (
              "Games in progress — points are provisional until the data window closes"
            )}
          </p>
        </div>
        <span className="flex gap-2">
          <Link href={gw.status === "SETTLED" ? `/results/${gw.id}` : "/results"} className="btn-ghost px-4 py-2 text-xs">Results</Link>
          <Link href="/leagues" className="btn-ghost px-4 py-2 text-xs">Mini-leagues</Link>
          <Link href="/top-performers" className="btn-ghost px-4 py-2 text-xs">Top performers</Link>
        </span>
        {gameweeks.length > 1 && (
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-1">
            {gameweeks.slice(0, 8).map((g) => (
              <Link key={g.id} href={`/matches?gw=${g.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${g.id === gw.id ? "bg-accent text-accent-ink" : "text-muted hover:text-fg"}`}>
                {g.simulated ? `SIM ${g.number}` : `GW${g.number}`}
              </Link>
            ))}
          </div>
        )}
      </div>

      <section>
        {comps.length === 0 ? (
          <EmptyState title="No matches yet this gameweek">New matches are added here before the deadline — check back soon.</EmptyState>
        ) : (
          <>
            <p className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-mint" /> Entered</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-danger" /> Open — not entered yet</span>
            </p>
            <ul className="grid gap-4 md:grid-cols-2">
              {comps.map((c) => (
                <li key={c.id}>
                  <MatchCard c={c} entry={c.entries[0]} paidEntry={paidEntry} results={results.get(c.id)} sim={gw.simulated} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-3xl">Fixtures &amp; results</h2>
        <div className="space-y-4">
          {[...byLeague.entries()].map(([league, fx]) => (
            <div key={league} className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
              <div className="border-b border-ink-700 bg-ink-850 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{league}</div>
              <div className="divide-y divide-ink-700/60">
                {fx.map((f) => (
                  <div key={f.id} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="truncate text-right">{f.homeClub.name}</span>
                    <span className="w-16 rounded-md bg-ink-800 py-0.5 text-center font-mono font-bold">
                      {f.status === "FINISHED" ? `${f.homeGoals}–${f.awayGoals}` : f.status === "POSTPONED" ? "P–P" : "v"}
                    </span>
                    <span className="truncate">{f.awayClub.name}</span>
                    <span className="w-24 text-right text-xs text-faint">
                      {f.status === "SCHEDULED" ? fmtDate(f.kickoffAt, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : f.status.toLowerCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">Live scores and stats update through the match. Points stay provisional until the data window closes.</p>
      </section>
    </div>
  );
}

