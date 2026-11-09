import Link from "next/link";
import { FORMATIONS, getRosterRules } from "@/domain/football/rules";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { footballSport } from "@/server/gameweeks";
import { fmtDate, relativeTime } from "@/lib/view";

export const metadata = { title: "Football" };

const STATUS_LABEL: Record<string, string> = {
  UPCOMING: "Opens soon",
  OPEN: "Open for entries",
  LOCKED: "Locked",
  PROVISIONAL: "Live · provisional",
  SETTLED: "Final",
  CANCELLED: "Cancelled",
};

export default async function FootballPage({ searchParams }: { searchParams: Promise<{ gw?: string }> }) {
  const user = await requireUser();
  const sport = await footballSport();
  const { gw: gwParam } = await searchParams;
  const gameweeks = await db.gameweek.findMany({ where: { sportId: sport.id }, orderBy: [{ season: "desc" }, { number: "desc" }] });
  const gw =
    gameweeks.find((g) => g.id === gwParam) ?? gameweeks.find((g) => g.status !== "SETTLED") ?? gameweeks[0];
  if (!gw) return <p className="text-muted">No gameweeks yet — an admin needs to create one.</p>;

  const [comps, fixtures] = await Promise.all([
    db.competition.findMany({
      where: { gameweekId: gw.id },
      include: { entries: { where: { userId: user.id } }, _count: { select: { entries: true } } },
      orderBy: { name: "asc" },
    }),
    db.fixture.findMany({
      where: { gameweekId: gw.id },
      include: { homeClub: { include: { league: true } }, awayClub: true },
      orderBy: [{ kickoffAt: "asc" }, { providerFixtureId: "asc" }],
    }),
  ]);
  const byLeague = new Map<string, typeof fixtures>();
  for (const f of fixtures) byLeague.set(f.homeClub.league.name, [...(byLeague.get(f.homeClub.league.name) ?? []), f]);
  const locksAt = comps[0]?.locksAt;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Football · {gw.season}</p>
          <h1 className="text-5xl font-extrabold">Gameweek {gw.number}</h1>
          <p className="text-sm text-muted">
            {gw.status === "OPEN" || gw.status === "UPCOMING"
              ? locksAt && `Squads lock ${relativeTime(locksAt)} (${fmtDate(locksAt)})`
              : gw.status === "SETTLED"
                ? "All competitions settled"
                : "Matches in progress — points are provisional until the data window closes"}
          </p>
        </div>
        {gameweeks.length > 1 && (
          <div className="flex gap-1 overflow-x-auto">
            {gameweeks.slice(0, 8).map((g) => (
              <Link
                key={g.id}
                href={`/football?gw=${g.id}`}
                className={`rounded-lg px-3 py-1 text-sm ${g.id === gw.id ? "bg-ink-800 text-lime" : "text-muted hover:text-fg"}`}
              >
                GW{g.number}
              </Link>
            ))}
          </div>
        )}
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {comps.map((c) => {
          const entry = c.entries[0];
          const rules = getRosterRules(c.rosterRules);
          return (
            <Link key={c.id} href={`/competitions/${c.id}`} className="panel group flex flex-col p-5 hover:border-lime/50">
              <div className="flex items-center justify-between">
                <span className="chip">{STATUS_LABEL[c.status]}</span>
                <span className="text-xs text-faint">{c._count.entries} entered</span>
              </div>
              <h2 className="mt-3 text-lg font-bold group-hover:text-lime">{c.name}</h2>
              <p className="text-xs text-muted">
                {c.format === "OPEN" ? "Any tier" : `${c.format.split("_")[0].toLowerCase()} cards only`} · formations{" "}
                {rules.allowedFormations.map((f) => FORMATIONS[f].id).join(", ")}
              </p>
              <div className="mt-auto pt-4 text-sm">
                {entry ? (
                  entry.finalPoints !== null ? (
                    <b className="text-lime">
                      {entry.finalPoints} pts · #{entry.rank}
                    </b>
                  ) : entry.provisionalPoints !== null ? (
                    <b className="text-mint">{entry.provisionalPoints} pts provisional</b>
                  ) : (
                    <span className="text-mint">Squad entered ✓ · edit until the deadline</span>
                  )
                ) : c.status === "OPEN" ? (
                  <span className="text-warn">Pick your squad →</span>
                ) : (
                  <span className="text-faint">View leaderboard →</span>
                )}
              </div>
            </Link>
          );
        })}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Fixtures &amp; results</h2>
        {[...byLeague.entries()].map(([league, fx]) => (
          <div key={league} className="panel overflow-hidden">
            <div className="border-b border-ink-700 bg-ink-850 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">{league}</div>
            <div className="divide-y divide-ink-700/60">
              {fx.map((f) => (
                <div key={f.id} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="truncate text-right">{f.homeClub.name}</span>
                  <span className="w-16 rounded-md bg-ink-800 py-0.5 text-center font-mono font-bold">
                    {f.status === "FINISHED" ? `${f.homeGoals}–${f.awayGoals}` : f.status === "POSTPONED" ? "P–P" : "v"}
                  </span>
                  <span className="truncate">{f.awayClub.name}</span>
                  <span className="w-28 text-right text-xs text-faint">
                    {f.status === "SCHEDULED" ? fmtDate(f.kickoffAt, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : f.status.toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-faint">
          Match data in this build comes from a simulated development feed. A licensed data provider has not been selected yet.
        </p>
      </section>
    </div>
  );
}
