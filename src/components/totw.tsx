import Link from "next/link";
import type { CardView } from "@/lib/view";
import { fmtDate } from "@/lib/view";
import { PlayerCard } from "./player-card";

type Totw = { number: number; expiresAt: Date; players: Array<{ playerId: string; points: number; position: string; card: CardView }> };

/** The current Team of the Week: 7 cards with their points, and when the badge comes off. */
export function TeamOfTheWeek({ totw, link = false }: { totw: Totw; link?: boolean }) {
  const order = ["GK", "DEF", "MID", "ATT"];
  const players = [...totw.players].sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position) || b.points - a.points);
  return (
    <section id="totw" className="scroll-mt-24 overflow-hidden rounded-3xl border border-[#f2cf63]/40 bg-ink-900 p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow text-gold">★ Gameweek {totw.number}</p>
          <h2 className="mt-1 text-3xl leading-none">Team of the Week</h2>
          <p className="mt-1 text-sm text-muted">
            The 7 best performers. Their cards wear the TOTW badge until {fmtDate(totw.expiresAt, { weekday: "short", day: "numeric", month: "short" })}.
          </p>
        </div>
        {link && (
          <Link href="/top-performers#totw" className="text-sm font-bold text-lime">
            All top performers →
          </Link>
        )}
      </div>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {players.map((p) => (
          <li key={p.playerId} className="shrink-0 snap-start text-center">
            <PlayerCard card={p.card} size="sm" showcase />
            <p className="mt-1.5 text-xs font-bold tabular-nums text-lime">{p.points} pts</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
