import Link from "next/link";
import { FinishPill } from "./finish-art";
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
export function CardRow({ card, href, children, sub, below, showValue = false }: { card: CardView; href?: string; children?: React.ReactNode; sub?: React.ReactNode; below?: React.ReactNode; showValue?: boolean }) {
  const body = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink-850">
        <KitShirt kit={card.kit} number={card.squadNumber} id={`row-${card.id}`} label={`${card.clubName ?? "Club"} home shirt`} className="h-9 w-auto" />
      </span>
      <span className="min-w-0 flex-1">
        {/* The name is the key thing: shown in full, over two lines if it needs them. */}
        <span className="line-clamp-2 break-words font-display text-base font-bold uppercase leading-tight tracking-wide sm:text-lg">{card.name}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          {card.finish ? (
            <FinishPill finish={card.finish} id={`row-${card.id}`} />
          ) : (
            <span className={`text-[10px] font-extrabold uppercase tracking-[0.16em] ${TIER_TEXT[card.category]}`}>{card.category}</span>
          )}
          <ClubBadge short={card.clubShort} primary={card.clubPrimary} secondary={card.clubSecondary} kit={card.kit} crestUrl={card.crestUrl} size={14} title={card.clubName ?? undefined} />
          <span className="min-w-0 truncate">{card.clubName ?? "Free agent"}</span>
          {card.stamps > 0 && <span className="rounded bg-ink-700 px-1.5 text-[10px] font-bold text-gold" title="History stamps">★ {card.stamps}</span>}
          {sub}
        </span>
        {showValue && !card.loan && (
          <span className="mt-1 flex items-center gap-2 md:hidden">
            <span className="text-sm font-bold tabular-nums text-fg">{card.valueMp !== null ? `${card.valueMp} MX` : "—"}</span>
            <ValueChange history={card.history} />
            {card.history && card.history.length > 1 && <Sparkline points={card.history} width={64} height={18} />}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li className={`row-item ${below ? "flex-wrap gap-y-1" : ""} tier-${card.finish?.kind ?? card.category} gap-3 sm:gap-4 ${card.loan?.ended ? "loan-ended" : ""}`}>
      <span className="hidden w-9 shrink-0 text-center text-[11px] font-extrabold tracking-[0.12em] text-muted sm:block">{card.position}</span>
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90">
          {body}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
      )}
      {showValue && !card.loan && (
        <span className="hidden w-28 shrink-0 flex-col items-end md:flex">
          {card.history && card.history.length > 1 ? <Sparkline points={card.history} width={96} height={24} /> : <span className="text-[10px] text-faint">No history yet</span>}
        </span>
      )}
      <span className="hidden w-24 shrink-0 text-right md:block">
        {card.loan ? (
          <>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">On loan</span>
            <span className={`font-bold tabular-nums ${card.loan.ended ? "text-danger" : ""}`}>
              {card.loan.ended ? "Loan ended" : `${card.loan.left} of ${card.loan.total} uses`}
            </span>
          </>
        ) : (
          <>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Value</span>
            <span className="font-bold tabular-nums">{card.valueMp !== null ? `${card.valueMp} MX` : "—"}</span>
            {showValue ? <ValueChange history={card.history} className="block" /> : <Trend pct={card.trendPct} className="ml-1" />}
          </>
        )}
      </span>
      {children}
      {below && <div className="w-full basis-full sm:pl-[104px]">{below}</div>}
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
  const flat = points[points.length - 1] === points[0];
  const label = `Value ${up ? "up" : "down"} from ${points[0]} to ${points[points.length - 1]} MX`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <title>{label}</title>
      <path d={d} fill="none" stroke={flat ? "var(--color-faint)" : up ? "var(--color-mint)" : "var(--color-danger)"} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
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

/** % change across the value graph (market movement over the recent valuations). */
export function ValueChange({ history, className = "" }: { history?: number[]; className?: string }) {
  if (!history || history.length < 2 || !history[0]) return <span className={`text-[10px] text-faint ${className}`}>–</span>;
  const pct = Math.round(((history[history.length - 1] - history[0]) / history[0]) * 1000) / 10;
  const tone = pct > 0 ? "text-mint" : pct < 0 ? "text-danger" : "text-faint";
  return (
    <span className={`text-[11px] font-bold tabular-nums ${tone} ${className}`} title="Change in value over the recent market valuations">
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "–"} {Math.abs(pct)}%
    </span>
  );
}
