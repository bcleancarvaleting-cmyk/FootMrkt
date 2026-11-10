import Link from "next/link";
import type { CardView } from "@/lib/view";
import { ClubBadge } from "./club-badge";
import { KitShirt } from "./kit-shirt";
import { Trend } from "./player-card";

const TIER_TEXT = { GOLD: "text-gold", SILVER: "text-silver", BRONZE: "text-bronze" } as const;
export const POS_ORDER = { GK: 0, DEF: 1, MID: 2, ATT: 3 } as const;

/**
 * One card as a full-width row: tier border · shirt · name/club · position · value. Pages put their
 * own columns (price, offers, actions) in `children`, which sit on the right.
 */
export function CardRow({ card, href, children, sub }: { card: CardView; href?: string; children?: React.ReactNode; sub?: React.ReactNode }) {
  const body = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink-850">
        <KitShirt kit={card.kit} number={card.squadNumber} id={`row-${card.id}`} label={`${card.clubName ?? "Club"} home shirt`} className="h-9 w-auto" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-lg font-bold uppercase leading-tight tracking-wide">{card.name}</span>
          <span className={`hidden text-[10px] font-extrabold uppercase tracking-[0.16em] sm:inline ${TIER_TEXT[card.category]}`}>{card.category}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
          <ClubBadge short={card.clubShort} primary={card.clubPrimary} secondary={card.clubSecondary} kit={card.kit} crestUrl={card.crestUrl} size={14} title={card.clubName ?? undefined} />
          <span className="truncate">{card.clubName ?? "Free agent"}</span>
          {sub}
        </span>
      </span>
    </>
  );
  return (
    <li className={`row-item tier-${card.category} gap-3 sm:gap-4`}>
      <span className="w-9 shrink-0 text-center text-[11px] font-extrabold tracking-[0.12em] text-muted">{card.position}</span>
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90">
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
      )}
      <span className="hidden w-24 shrink-0 text-right md:block">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Value</span>
        <span className="font-bold tabular-nums">{card.valueMp !== null ? `${card.valueMp} MX` : "—"}</span>
        <Trend pct={card.trendPct} className="ml-1" />
      </span>
      {children}
    </li>
  );
}

/** Tiny all-time value line. Green if up over the period, red if down. */
export function Sparkline({ points, width = 96, height = 30 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return <span className="block text-[10px] text-faint" style={{ width }}>No history yet</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 4);
  const d = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= points[0];
  const label = `Value ${up ? "up" : "down"} from ${points[0]} to ${points[points.length - 1]} MX`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <title>{label}</title>
      <path d={d} fill="none" stroke={up ? "var(--color-mint)" : "var(--color-danger)"} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Label + value cell for the right-hand columns of a row. */
export function RowStat({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={`shrink-0 text-right ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</span>
      <span className="font-bold tabular-nums">{children}</span>
    </span>
  );
}
