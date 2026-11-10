import Link from "next/link";
import { Countdown } from "@/components/countdown";
import { EmptyState } from "@/components/page-header";
import { FORMATIONS, getRosterRules } from "@/domain/football/rules";
import { requireUser } from "@/server/auth/session";
import { type Requirements, podiums, prizesSummary, requirementsSummary } from "@/server/competitions";
import { FoundingBadge } from "@/components/founding-badge";
import { db } from "@/server/db";
import { isEnabled } from "@/server/flags";
import { footballSport } from "@/server/gameweeks";
import { fmtMp } from "@/server/wallet";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Matches" };

const STATUS: Record<string, [string, string]> = {
  UPCOMING: ["Opens soon", "text-muted"],
  OPEN: ["Open", "text-lime"],
  LOCKED: ["Locked", "text-warn"],
  PROVISIONAL: ["Live", "text-danger"],
  SETTLED: ["Final", "text-faint"],
  CANCELLED: ["Cancelled", "text-faint"],
};
const FORMAT_TIER: Record<string, string> = { OPEN: "", BRONZE_ONLY: "tier-BRONZE", SILVER_ONLY: "tier-SILVER", GOLD_ONLY: "tier-GOLD" };

export default async function MatchesPage({ searchParams }: { searchParams: Promise<{ gw?: string }> }) {
  const user = await requireUser();
  const sport = await footballSport();
  const { gw: gwParam } = await searchParams;
  const gameweeks = await db.gameweek.findMany({ where: { sportId: sport.id }, orderBy: [{ season: "desc" }, { number: "desc" }] });
  const gw = gameweeks.find((g) => g.id === gwParam) ?? gameweeks.find((g) => g.status !== "SETTLED") ?? gameweeks[0];
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
          <p className="eyebrow">{gw.season} season</p>
          <h1 className="mt-1 text-4xl leading-none sm:text-5xl">Gameweek {gw.number}</h1>
          <p className="mt-2 text-sm text-muted">
            {open && locksAt ? (
              <>
                Squads lock in <Countdown to={locksAt.toISOString()} className="font-bold text-lime" /> · {fmtDate(locksAt)} — 10 minutes before the first kick-off
              </>
            ) : gw.status === "SETTLED" ? (
              "All matches settled"
            ) : (
              "Games in progress — points are provisional until the data window closes"
            )}
          </p>
        </div>
        {gameweeks.length > 1 && (
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-1">
            {gameweeks.slice(0, 8).map((g) => (
              <Link key={g.id} href={`/matches?gw=${g.id}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${g.id === gw.id ? "bg-accent text-accent-ink" : "text-muted hover:text-fg"}`}>
                GW{g.number}
              </Link>
            ))}
          </div>
        )}
      </div>

      <section>
        <div className="mb-2 hidden items-center gap-4 px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint md:flex">
          <span className="flex-1">Match · requirements</span>
          <span className="w-20 text-right">Entry</span>
          <span className="w-20 text-right">Managers</span>
          <span className="w-24 text-right">Status</span>
          <span className="w-40 text-right">Your squad</span>
        </div>
        <ul className="space-y-2">
          {comps.map((c) => {
            const entry = c.entries[0];
            const rules = getRosterRules(c.rosterRules);
            const [label, tone] = STATUS[c.status];
            const feeBlocked = c.entryFeeMinor > 0 && !paidEntry;
            return (
              <li key={c.id}>
                <Link href={`/competitions/${c.id}`} className={`row-item flex-wrap md:flex-nowrap ${FORMAT_TIER[c.format]}`}>
                  <span className="min-w-0 flex-1 basis-full md:basis-auto">
                    <span className="block font-display text-xl font-bold uppercase italic leading-tight">{c.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {requirementsSummary((c.requirements ?? {}) as Requirements, c.format)} · {rules.allowedFormations.map((f) => FORMATIONS[f].id).join(" / ")}
                    </span>
                    {prizesSummary(c.rewards) && <span className="mt-0.5 block text-xs font-semibold text-lime">{prizesSummary(c.rewards)}</span>}
                    {(results.get(c.id)?.length ?? 0) > 0 && (
                      <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {results.get(c.id)!.map((p, i) => (
                          <span key={i} className="flex items-center gap-1">
                            <span className={`font-extrabold ${p.rank === 1 ? "text-gold" : p.rank === 2 ? "text-silver" : "text-bronze"}`}>{p.rank === 1 ? "1st" : p.rank === 2 ? "2nd" : "3rd"}</span>
                            <span className="font-semibold text-fg">{p.displayName}</span>
                            <FoundingBadge number={p.foundingNumber} compact />
                            <span className="text-muted">{p.points} pts</span>
                            {p.prizeMinor > 0 && <span className="font-bold text-lime">£{(p.prizeMinor / 100).toFixed(2)}</span>}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="w-20 text-right font-bold tabular-nums">{c.entryFeeMinor > 0 ? fmtMp(c.entryFeeMinor) : <span className="text-lime">Free</span>}</span>
                  <span className="w-20 text-right text-sm tabular-nums text-muted">{c._count.entries}</span>
                  <span className={`w-24 text-right text-xs font-extrabold uppercase tracking-[0.14em] ${tone}`}>{label}</span>
                  <span className="w-40 text-right text-sm">
                    {entry ? (
                      entry.finalPoints !== null ? (
                        <b className="text-lime">{entry.finalPoints} pts · #{entry.rank}</b>
                      ) : entry.provisionalPoints !== null ? (
                        <b className="text-mint">{entry.provisionalPoints} pts live</b>
                      ) : (
                        <span className="text-mint">Entered ✓</span>
                      )
                    ) : c.status === "OPEN" ? (
                      feeBlocked ? <span className="text-faint">Paid entry soon</span> : <span className="btn-primary px-3 py-1.5 text-[11px]">Pick squad</span>
                    ) : (
                      <span className="text-faint">Leaderboard →</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
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
        <p className="mt-3 text-xs text-faint">Match data in this build is simulated. A licensed data provider will power launch.</p>
      </section>
    </div>
  );
}
