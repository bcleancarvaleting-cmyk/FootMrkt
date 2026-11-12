import Link from "next/link";
import { SimBadge } from "@/components/sim-badge";
import { resultsList } from "@/server/results";
import { fmtDate } from "@/lib/view";

export const metadata = { title: "Results" };
export const dynamic = "force-dynamic";

/** Every matchday played — simulated and real — with its winners. Watch it again, or see the full results. */
export default async function ResultsPage() {
  const days = await resultsList();
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Every matchday</p>
        <h1 className="mt-1 text-4xl leading-none sm:text-5xl">Results</h1>
        <p className="mt-2 text-sm text-muted">Who won, with what team — and watch any simulated matchday again.</p>
      </div>
      {days.length === 0 && <p className="panel p-6 text-sm text-muted">No results yet. They appear here after the first matchday is played.</p>}
      <ul className="space-y-4">
        {days.map((d) => (
          <li key={d.id} className={`overflow-hidden rounded-2xl border bg-ink-900 ${d.simulated ? "border-[#8fe3ff]/40" : "border-ink-700"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3">
              <div>
                <p className="flex items-center gap-2 font-display text-2xl font-black uppercase italic leading-none">
                  {d.title} {d.simulated && <SimBadge />}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {fmtDate(d.startsAt, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {!d.settled && <span className="ml-2 font-bold text-danger">● In play</span>}
                </p>
              </div>
            </div>
            <ul className="divide-y divide-ink-700/60">
              {d.matches.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.name}</span>
                    <span className="text-xs text-muted">
                      {m.entries} manager{m.entries === 1 ? "" : "s"}
                      {m.pot && <b className="ml-2 text-lime">{m.pot.replace(" pot", " Pot")}</b>}
                    </span>
                  </span>
                  {m.settled && m.winners.length > 0 ? (
                    <span className="text-right">
                      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-gold">🏆 Winner{m.winners.length > 1 ? "s" : ""}</span>
                      <span className="block max-w-[150px] truncate font-bold">{m.winners.join(", ")}</span>
                      {m.points != null && <span className="text-xs tabular-nums text-muted">{Math.round(m.points * 10) / 10} pts</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-faint">{m.settled ? "—" : "Playing…"}</span>
                  )}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2 border-t border-ink-700 p-3">
              {d.simulated ? (
                <Link href={d.settled ? `/watch?gw=${d.id}&replay=1` : `/watch?gw=${d.id}`} className="btn bg-[#8fe3ff] py-3 text-[12px] text-[#04121a]">
                  {d.settled ? "▶ Watch game" : "● Watch live"}
                </Link>
              ) : (
                <Link href={`/watch?scope=real&gw=${d.id}`} className="btn border border-ink-600 bg-ink-850 py-3 text-[12px] text-fg">
                  {d.settled ? "Final table" : "● Watch live"}
                </Link>
              )}
              <Link href={`/results/${d.id}`} className="btn-primary py-3 text-[12px]">
                See results
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
