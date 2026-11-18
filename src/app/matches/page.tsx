import Link from "next/link";
import { MatchesTabs } from "@/components/matches-tabs";
import { MatchCard } from "@/components/match-card";
import { SimBadge } from "@/components/sim-badge";
import { TickerMode } from "@/components/scores-ticker";
import { Countdown } from "@/components/countdown";
import { EmptyState } from "@/components/page-header";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { footballSport } from "@/server/gameweeks";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Matches" };

const stillOpen = (locksAt: Date) => locksAt.getTime() > Date.now();

/**
 * Matches: one list of everything coming up (real gameweeks and simulated matchdays), soonest
 * deadline first. No gameweek picker (managers couldn't find the right one); finished games live on
 * the Results tab.
 */
export default async function MatchesPage() {
  const user = await requireUser();
  const sport = await footballSport();
  const upcoming = await db.gameweek.findMany({ where: { sportId: sport.id, status: { not: "SETTLED" } }, orderBy: [{ startsAt: "asc" }], take: 8 });
  const [comps, paidEntry] = await Promise.all([
    db.competition.findMany({
      where: { gameweekId: { in: upcoming.map((g) => g.id) }, status: { not: "SETTLED" } },
      include: { entries: { where: { userId: user.id } }, _count: { select: { entries: true } } },
      orderBy: [{ locksAt: "asc" }, { entryFeeMinor: "asc" }, { name: "asc" }],
    }),
    isEnabled("PAID_ENTRY"),
  ]);
  const groups = upcoming.map((g) => ({ gw: g, comps: comps.filter((c) => c.gameweekId === g.id) })).filter((x) => x.comps.length);
  const firstFixtureGw = groups[0]?.gw;
  const fixtures = firstFixtureGw
    ? await db.fixture.findMany({
        where: { gameweekId: firstFixtureGw.id },
        include: { homeClub: { include: { league: true } }, awayClub: true },
        orderBy: [{ kickoffAt: "asc" }, { providerFixtureId: "asc" }],
      })
    : [];
  const byLeague = new Map<string, typeof fixtures>();
  for (const f of fixtures) byLeague.set(f.homeClub.league.name, [...(byLeague.get(f.homeClub.league.name) ?? []), f]);

  return (
    <div className="space-y-10">
      <MatchesTabs active="/matches" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Every game you can enter</p>
          <h1 className="mt-1 text-4xl leading-none sm:text-5xl">Upcoming</h1>
          <p className="mt-2 text-sm text-muted">Soonest deadline first. Finished games are on Results.</p>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-mint" /> Entered</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-danger" /> Open — not entered yet</span>
          </p>
          <TickerMode mode="matches" />
        </div>
        <span className="flex gap-2 overflow-x-auto">
          <Link href="/results" className="btn-ghost whitespace-nowrap px-3 py-1.5 text-[11px]">Results</Link>
          <Link href="/leagues" className="btn-ghost whitespace-nowrap px-3 py-1.5 text-[11px]">Mini-leagues</Link>
          <Link href="/top-performers" className="btn-ghost whitespace-nowrap px-3 py-1.5 text-[11px]">Top performers</Link>
        </span>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="No matches open right now">New matches are added here before each deadline — check back soon.</EmptyState>
      ) : (
        <>
          {groups.map(({ gw, comps: list }) => {
            const locksAt = list[0].locksAt;
            const open = stillOpen(locksAt);
            return (
              <section key={gw.id} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-700 bg-ink-900 px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-2xl leading-none">
                      {gw.simulated ? <>Sim matchday {gw.number} <SimBadge className="text-[10px]" /></> : <>Gameweek {gw.number}</>}
                    </h2>
                    <p className="mt-1 text-xs text-faint">
                      {fmtDate(locksAt, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {list.length} {list.length === 1 ? "game" : "games"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {gw.simulated && (
                      <Link href="/watch" className="btn-glow px-3 py-1.5 text-[11px]">
                        ▶ Watch
                      </Link>
                    )}
                    {open ? (
                      <span className="rounded-xl bg-ink-800 px-3 py-1.5 text-right">
                        <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-faint">Locks in</span>
                        <Countdown to={locksAt.toISOString()} className="font-bold tabular-nums text-lime" />
                      </span>
                    ) : (
                      <span className="rounded-xl bg-danger/15 px-3 py-1.5 text-xs font-bold text-[#ff8a8a]">Live now</span>
                    )}
                  </div>
                </div>
                <ul className="grid gap-4 md:grid-cols-2">
                  {list.map((c) => (
                    <li key={c.id}>
                      <MatchCard c={c} entry={c.entries[0]} paidEntry={paidEntry} results={undefined} sim={gw.simulated} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {firstFixtureGw && fixtures.length > 0 && (
        <section>
          <h2 className="mb-3 text-3xl">
            Next fixtures <span className="text-base text-faint">· {firstFixtureGw.simulated ? `Sim matchday ${firstFixtureGw.number}` : `Gameweek ${firstFixtureGw.number}`}</span>
          </h2>
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
      )}
    </div>
  );
}
