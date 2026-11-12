import Link from "next/link";
import { removeMatchAction } from "@/app/actions/admin";
import { ActionButton } from "@/components/action-button";
import { MatchRulesForm } from "@/components/admin-forms";
import { NewGameForm } from "@/components/admin-games";
import { SimBadge } from "@/components/sim-badge";
import { type Requirements, prizesSummary, requirementsSummary } from "@/server/competitions";
import { db } from "@/server/db";
import { fmtDate } from "@/lib/view";

/**
 * Admin → Games, in three parts: create a game (real or sim — every game is made by hand), the
 * games that are open or being played, and results. Fixtures load on their own in the background.
 */
const gbp = (m: number) => `£${(m / 100).toFixed(m % 100 ? 2 : 0)}`;
const potOf = (rewards: unknown) => ((rewards as Array<{ cashMinor?: number; rankFrom: number; rankTo: number }>) ?? []).reduce((s, r) => s + (r.cashMinor ?? 0) * (r.rankTo - r.rankFrom + 1), 0);
const ukDay = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });

export async function GamesAdmin() {
  const now = new Date();
  const [weeksRaw, live, done, leagueRows, suggested] = await Promise.all([
    db.gameweek.findMany({
      where: { simulated: false, status: { in: ["OPEN", "UPCOMING"] } },
      orderBy: { startsAt: "asc" },
      take: 6,
      select: {
        id: true,
        number: true,
        fixtures: {
          where: { status: "SCHEDULED", kickoffAt: { gt: new Date(now.getTime() + 11 * 60_000) } },
          orderBy: { kickoffAt: "asc" },
          select: { id: true, kickoffAt: true, homeClub: { select: { name: true, league: { select: { name: true } } } }, awayClub: { select: { name: true } } },
        },
      },
    }),
    db.competition.findMany({
      where: { status: { in: ["UPCOMING", "OPEN", "LOCKED", "PROVISIONAL"] } },
      orderBy: { locksAt: "asc" },
      take: 60,
      select: { id: true, name: true, status: true, locksAt: true, entryFeeMinor: true, rewards: true, requirements: true, format: true, gameweek: { select: { id: true, number: true, simulated: true, startsAt: true } }, _count: { select: { entries: true } } },
    }),
    db.competition.findMany({
      where: { status: "SETTLED", entries: { some: { status: "ACTIVE" } } },
      orderBy: { settledAt: "desc" },
      take: 20,
      select: { id: true, name: true, settledAt: true, rewards: true, gameweek: { select: { id: true, simulated: true } }, _count: { select: { entries: true } }, entries: { where: { rank: 1, status: "ACTIVE" }, take: 3, select: { finalPoints: true, user: { select: { displayName: true } } } } },
    }),
    db.league.findMany({ orderBy: { tier: "asc" }, select: { code: true, name: true } }),
    import("@/server/sim-matchday").then((m) => m.suggestedSimKickoff(now)),
  ]);
  const weeks = weeksRaw.filter((w) => w.fixtures.length);
  const weekOpts = weeks.map((w) => ({ id: w.id, label: `GW${w.number} · ${ukDay(w.fixtures[0].kickoffAt)} – ${ukDay(w.fixtures[w.fixtures.length - 1].kickoffAt)} · ${w.fixtures.length} fixtures` }));
  const fixtures = weeks.flatMap((w) =>
    w.fixtures.map((f) => ({
      value: f.id,
      week: w.id,
      league: f.homeClub.league.name,
      label: `${f.homeClub.name} v ${f.awayClub.name} · ${f.kickoffAt.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`,
    })),
  );
  const leagueOpts = leagueRows.map((l) => ({ value: l.code, label: l.name }));
  const kickoff = (c: (typeof live)[number]) => (c.gameweek.simulated ? c.gameweek.startsAt : new Date(c.locksAt.getTime() + 10 * 60_000));
  const STATUS: Record<string, [string, string]> = { UPCOMING: ["Opens soon", "text-muted"], OPEN: ["Open for entries", "text-lime"], LOCKED: ["Entries closed", "text-warn"], PROVISIONAL: ["● Live", "text-danger"] };

  return (
    <div className="space-y-8">
      <section className="panel p-4 sm:p-5">
        <h2 className="mb-1 text-2xl">Create a game</h2>
        <p className="mb-4 text-xs text-muted">Every game is made by you — nothing is created automatically. Add one whenever you like, each one different.</p>
        <NewGameForm weeks={weekOpts} fixtures={fixtures} suggestedKickoff={suggested} />
      </section>

      <section className="panel p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-2xl">Live games</h2>
          <span className="text-xs text-muted">{live.length} open or playing</span>
        </div>
        {live.length === 0 && <p className="text-sm text-faint">No games yet — create one above.</p>}
        <ul className="space-y-2">
          {live.map((c) => {
            const [label, tone] = STATUS[c.status] ?? ["", ""];
            const pot = potOf(c.rewards);
            const open = c.status === "OPEN" || c.status === "UPCOMING";
            return (
              <li key={c.id} className={`rounded-2xl border bg-ink-850 ${c.gameweek.simulated ? "border-[#8fe3ff]/30" : "border-ink-700"}`}>
                <div className="space-y-2 px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      {c.gameweek.simulated ? <SimBadge /> : <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-accent-ink">Real</span>}
                      <b className="min-w-0 break-words">{c.name}</b>
                    </span>
                    <span className={`shrink-0 text-xs font-bold ${tone}`}>{label}</span>
                  </div>
                  <p className="text-xs text-muted">
                    KO {fmtDate(kickoff(c), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {c._count.entries} entered · {c.entryFeeMinor ? `${gbp(c.entryFeeMinor)} entry` : "free"} · {pot ? <b className="text-lime">{gbp(pot)} Pot</b> : "no £ pot"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={c.gameweek.simulated ? `/watch?gw=${c.gameweek.id}` : "/watch?scope=real"} className="btn-ghost px-3 py-1.5 text-[11px]">Watch</Link>
                    <Link href={`/competitions/${c.id}`} className="btn-ghost px-3 py-1.5 text-[11px]">Open game</Link>
                    {open && (
                      <ActionButton
                        action={removeMatchAction.bind(null, c.id)}
                        className="btn-ghost px-3 py-1.5 text-[11px] text-danger"
                        confirm={`Remove "${c.name}"?${c._count.entries ? ` ${c._count.entries} manager${c._count.entries > 1 ? "s have" : " has"} entered — they're refunded, their players freed and they're told.` : ""}`}
                      >
                        Remove
                      </ActionButton>
                    )}
                  </div>
                </div>
                {open && (
                  <details className="border-t border-ink-700 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-bold text-muted">Edit rules · {requirementsSummary((c.requirements ?? {}) as Requirements, c.format)}</summary>
                    <div className="pt-3">
                      <MatchRulesForm
                        id={c.id}
                        fee={c.entryFeeMinor}
                        req={(c.requirements ?? {}) as Requirements}
                        leagues={leagueOpts}
                        prizes={pot ? String(pot / 100) : ""}
                      />
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="panel p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-2xl">Results</h2>
          <Link href="/results" className="text-xs font-bold text-lime">All results →</Link>
        </div>
        {done.length === 0 && <p className="text-sm text-faint">No finished games yet.</p>}
        <ul className="divide-y divide-ink-700/60">
          {done.map((c) => (
            <li key={c.id}>
              <Link href={`/results/${c.gameweek.id}`} className="flex flex-wrap items-center gap-3 py-2.5 hover:opacity-90">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {c.gameweek.simulated ? <SimBadge /> : <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-accent-ink">Real</span>}
                    <b className="truncate">{c.name}</b>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {c.settledAt ? fmtDate(c.settledAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""} · {c._count.entries} played{prizesSummary(c.rewards) ? ` · ${prizesSummary(c.rewards).split(" · ")[0]}` : ""}
                  </span>
                </span>
                <span className="text-right text-sm">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-gold">🏆 Winner</span>
                  <b>{c.entries.map((e) => e.user.displayName).join(", ") || "—"}</b>
                  {c.entries[0]?.finalPoints != null && <span className="ml-1 text-xs text-muted">{Math.round(c.entries[0].finalPoints * 10) / 10} pts</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-center text-[11px] text-faint">Times are UK time. Live games refresh when you reload.</p>
    </div>
  );
}
