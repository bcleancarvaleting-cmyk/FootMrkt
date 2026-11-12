import Link from "next/link";
import { notFound } from "next/navigation";
import { SimBadge } from "@/components/sim-badge";
import { TeamCard } from "@/components/watch-live";
import { matchdayResults } from "@/server/results";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Results" };
export const dynamic = "force-dynamic";

const gbp = (m: number) => `£${(m / 100).toFixed(m % 100 ? 2 : 0)}`;

/** One matchday's results: per match the winner(s) with their winning team, and the final table. */
export default async function MatchdayResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const r = await matchdayResults(id);
  if (!r) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Link href="/results" className="text-xs text-faint hover:text-fg">← All results</Link>
        <h1 className="mt-1 flex items-center gap-3 text-4xl leading-none sm:text-5xl">
          {r.title} {r.simulated && <SimBadge className="text-xs" />}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {fmtDate(r.startsAt, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
          {!r.settled && <b className="ml-2 text-danger">● Still being played — provisional</b>}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {r.simulated && (
            <Link href={r.settled ? `/watch?gw=${r.id}&replay=1` : `/watch?gw=${r.id}`} className="btn-glow px-5 py-3 text-[12px]">
              {r.settled ? "▶ Watch game" : "● Watch live"}
            </Link>
          )}
        </div>
      </div>

      {r.matches.length === 0 && <p className="panel p-6 text-sm text-muted">No one entered a match on this matchday.</p>}

      {r.matches.map((m) => (
        <section key={m.id} className="space-y-3 rounded-3xl border border-ink-700 bg-ink-950/40 p-3 sm:p-4">
          <div className="flex flex-wrap items-end justify-between gap-2 px-1">
            <div>
              <h2 className="font-display text-3xl font-black uppercase italic leading-none">{m.name}</h2>
              <p className="mt-1 text-xs text-muted">
                {m.entries} manager{m.entries === 1 ? "" : "s"}
                {m.pot && <b className="ml-2 text-lime">{m.pot.replace(" pot", " Pot")}</b>}
              </p>
            </div>
          </div>

          {m.winners.length > 0 && (
            <div className="space-y-3">
              {m.winners.map((w) => (
                <div key={w.entryId} className="relative">
                  <div className="results-crown pointer-events-none absolute -top-2 left-4 z-10 rounded-full bg-gradient-to-r from-[#b8862b] via-[#f9e08b] to-[#d9a93f] px-3 py-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#1a1203] shadow-lg">
                    🏆 {m.settled ? (m.winners.length > 1 ? "Joint winner" : "Winner") : "Leading"} · {w.manager}
                    {m.table.find((t) => t.entryId === w.entryId)?.prizeMinor ? ` · won ${gbp(m.table.find((t) => t.entryId === w.entryId)!.prizeMinor)}` : ""}
                  </div>
                  <div className="pt-3">
                    <TeamCard team={w} label={w.club ?? w.manager} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
            <div className="grid grid-cols-[2.5rem_1fr_auto_auto] gap-x-3 border-b border-ink-700 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
              <span>#</span>
              <span>Manager</span>
              <span className="text-right">Prize</span>
              <span className="w-12 text-right">Pts</span>
            </div>
            {m.table.map((t) => (
              <Link key={t.entryId} href={`/competitions/${m.id}/team/${t.entryId}`} className="grid grid-cols-[2.5rem_1fr_auto_auto] items-center gap-x-3 border-b border-ink-700/50 px-3 py-2.5 text-sm last:border-0 hover:bg-ink-850">
                <span className={`font-display text-xl font-black italic tabular-nums ${t.rank === 1 ? "text-gold" : t.rank <= 3 ? "text-fg" : "text-muted"}`}>{t.rank}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{t.name}</span>
                  {t.club && <span className="block truncate text-[11px] text-faint">{t.club}</span>}
                </span>
                <span className="text-right text-xs font-black text-lime">{t.prizeMinor ? gbp(t.prizeMinor) : ""}</span>
                <span className="w-12 text-right font-display text-xl font-black italic tabular-nums">{t.points}</span>
              </Link>
            ))}
          </div>
          <p className="px-1 text-[11px] text-faint">Tap any manager to see their team.</p>
        </section>
      ))}
    </div>
  );
}
