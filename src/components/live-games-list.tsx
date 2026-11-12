import Link from "next/link";
import { db } from "@/server/db";

/**
 * Home, under the hero: every game open or being played — Sim or Live (real) · game · entries ·
 * entry price — with one tap to Enter now, Edit team or Watch.
 */
const gbp = (m: number) => `£${(m / 100).toFixed(m % 100 ? 2 : 0)}`;
const ukWhen = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export async function LiveGamesList({ userId }: { userId: string | null }) {
  const guest = !userId;
  const now = new Date();
  const games = await db.competition.findMany({
    where: { status: { in: ["UPCOMING", "OPEN", "LOCKED", "PROVISIONAL"] } },
    orderBy: { locksAt: "asc" },
    take: 25,
    select: {
      id: true,
      name: true,
      status: true,
      locksAt: true,
      entryFeeMinor: true,
      rewards: true,
      gameweek: { select: { id: true, simulated: true, startsAt: true } },
      _count: { select: { entries: { where: { status: "ACTIVE" } } } },
      entries: { where: { userId: userId ?? "00000000-0000-0000-0000-000000000000", status: "ACTIVE" }, select: { id: true } },
    },
  });
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <p className="eyebrow text-lime">{guest ? "Free to enter" : "Enter now"}</p>
          <h2 className="text-3xl leading-none">{guest ? "Upcoming games" : "Live games"}</h2>
        </div>
        <Link href={guest ? "/register" : "/matches"} className="text-xs font-bold uppercase tracking-[0.14em] text-lime">{guest ? "Join free →" : "All matches →"}</Link>
      </div>
      {games.length === 0 ? (
        <p className="panel p-5 text-sm text-muted">No games open right now — new ones are added all the time.</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
          <li className="hidden grid-cols-[70px_minmax(0,1fr)_90px_110px_150px] gap-3 border-b border-ink-700 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-faint md:grid">
            <span>Type</span>
            <span>Game</span>
            <span className="text-right">Entries</span>
            <span className="text-right">Entry</span>
            <span />
          </li>
          {games.map((g) => {
            const sim = g.gameweek.simulated;
            const ko = sim ? g.gameweek.startsAt : new Date(g.locksAt.getTime() + 10 * 60_000);
            const open = (g.status === "OPEN" || g.status === "UPCOMING") && g.locksAt > now;
            const playing = g.status === "PROVISIONAL" || g.status === "LOCKED" || (!open && g.locksAt <= now);
            const mine = g.entries.length > 0;
            const pot = ((g.rewards as Array<{ cashMinor?: number; rankFrom: number; rankTo: number }>) ?? []).reduce((s, r) => s + (r.cashMinor ?? 0) * (r.rankTo - r.rankFrom + 1), 0);
            const action = guest
              ? { href: "/register", label: playing ? "Join to play" : "Enter now", cls: "bg-accent text-accent-ink" }
              : playing
              ? { href: sim ? `/watch?gw=${g.gameweek.id}` : "/watch?scope=real", label: "● Watch", cls: "btn-glow !px-4 !py-2 !text-[11px]" }
              : mine
                ? { href: `/competitions/${g.id}`, label: "Edit team", cls: "border border-mint/70 text-mint" }
                : { href: `/competitions/${g.id}`, label: "Enter now", cls: "bg-accent text-accent-ink" };
            return (
              <li key={g.id} className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-ink-700/60 px-4 py-3 last:border-0 md:grid-cols-[70px_minmax(0,1fr)_90px_110px_150px] ${mine ? "bg-mint/[0.04]" : ""}`}>
                <span className={`w-fit rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${sim ? "bg-[#8fe3ff] text-[#04121a]" : "bg-accent text-accent-ink"}`}>{sim ? "Sim" : "Live"}</span>
                <span className="min-w-0">
                  <b className="block truncate">{g.name.replace(/ · (SIM|GW) ?\d+$/, "")}</b>
                  <span className="block text-[11px] leading-snug text-muted">
                    {playing ? <span className="font-bold text-danger">● In play</span> : <>KO {ukWhen(ko)}</>}
                    {pot > 0 && <b className="ml-2 text-lime">{gbp(pot)} Pot</b>}
                    <span className="md:hidden">
                      {" "}
                      · {g._count.entries} in · {g.entryFeeMinor ? gbp(g.entryFeeMinor) : "Free"}
                    </span>
                  </span>
                </span>
                <span className="hidden text-right tabular-nums md:block">{g._count.entries.toLocaleString("en-GB")}</span>
                <span className="hidden text-right font-bold md:block">{g.entryFeeMinor ? gbp(g.entryFeeMinor) : <span className="text-lime">Free</span>}</span>
                <Link href={action.href} className={`justify-self-end whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-wide ${action.cls}`}>
                  {action.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
