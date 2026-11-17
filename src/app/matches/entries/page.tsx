import Link from "next/link";
import { MatchesTabs } from "@/components/matches-tabs";
import { EmptyState } from "@/components/page-header";
import { SimBadge } from "@/components/sim-badge";
import { requireUser } from "@/server/auth/session";
import { prizesPaid } from "@/server/competitions";
import { db } from "@/server/db";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Your entries" };

/** Every team you've entered: open ones you can still change, live ones, and finished ones with your place and prize. */
export default async function EntriesPage() {
  const user = await requireUser();
  const entries = await db.competitionEntry.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    orderBy: [{ competition: { locksAt: "desc" } }, { entryNo: "asc" }],
    take: 80,
    include: { competition: { select: { id: true, name: true, status: true, locksAt: true, entryFeeMinor: true, gameweek: { select: { number: true, simulated: true } }, _count: { select: { entries: true } } } } },
  });
  if (!entries.length) {
    return (
      <div>
        <MatchesTabs active="/matches/entries" />
        <EmptyState title="No entries yet">
          Pick a team in any open match on <Link href="/matches" className="text-lime underline">Matches</Link>.
        </EmptyState>
      </div>
    );
  }
  const prizes = new Map<string, Map<string, number>>();
  for (const id of new Set(entries.filter((e) => e.competition.status === "SETTLED").map((e) => e.competition.id))) prizes.set(id, await prizesPaid(id));
  const groups: Array<[string, typeof entries]> = [
    ["Open — you can still change these", entries.filter((e) => e.competition.status === "OPEN" || e.competition.status === "UPCOMING")],
    ["Live", entries.filter((e) => e.competition.status === "LOCKED" || e.competition.status === "PROVISIONAL")],
    ["Finished", entries.filter((e) => e.competition.status === "SETTLED")],
  ];
  return (
    <div className="space-y-8">
      <MatchesTabs active="/matches/entries" />
      {groups.map(([title, list]) =>
        list.length ? (
          <section key={title}>
            <h2 className="mb-3 text-2xl">{title}</h2>
            <ul className="divide-y divide-ink-700 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
              {list.map((e) => {
                const c = e.competition;
                const settled = c.status === "SETTLED";
                const pts = settled ? e.finalPoints : e.provisionalPoints;
                const prize = settled ? (prizes.get(c.id)?.get(e.entryNo > 1 ? `${user.id}:${e.entryNo}` : user.id) ?? 0) : 0;
                return (
                  <li key={e.id}>
                    <Link href={`/competitions/${c.id}${e.entryNo > 1 ? `?team=${e.entryNo}` : ""}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-850">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 truncate font-semibold">
                          {c.name.replace(/ · (SIM|GW) ?\d+$/, "")}
                          {c.gameweek.simulated && <SimBadge className="text-[9px]" />}
                          {e.entryNo > 1 && <span className="rounded bg-ink-700 px-1.5 text-[10px] font-bold">Team {e.entryNo}</span>}
                        </span>
                        <span className="block truncate text-xs text-faint">
                          {c.gameweek.simulated ? `Matchday ${c.gameweek.number}` : `Gameweek ${c.gameweek.number}`} · {c._count.entries} teams · {c.entryFeeMinor ? `£${(c.entryFeeMinor / 100).toFixed(2)} entry` : "Free"}
                          {c.status === "OPEN" && ` · locks ${fmtDate(c.locksAt, { weekday: "short", hour: "2-digit", minute: "2-digit" })}`}
                        </span>
                      </span>
                      {prize > 0 && <span className="rounded-full border border-gold/60 bg-gold/10 px-2 py-0.5 text-[11px] font-black text-gold">Won £{(prize / 100).toFixed(2)}</span>}
                      <span className="text-right">
                        <span className="block font-display text-xl font-black italic tabular-nums text-lime">{pts !== null ? `${Math.round(pts * 10) / 10}` : "—"}</span>
                        <span className="block text-[10px] text-faint">{settled && e.rank ? `#${e.rank}` : c.status === "OPEN" ? "pts" : "live"}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
