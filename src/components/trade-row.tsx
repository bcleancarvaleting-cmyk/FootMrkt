import Link from "next/link";
import type { CardView } from "@/lib/view";
import { Sparkline } from "./card-row";
import { ClubBadge } from "./club-badge";
import { Gem, FINISH_STYLE } from "./finish-art";
import { KitShirt } from "./kit-shirt";

const TIER_TEXT = { GOLD: "text-gold", SILVER: "text-silver", BRONZE: "text-bronze" } as const;
const POS_NAME = { GK: "GK", DEF: "DEF", MID: "MID", ATT: "ATT" } as const;

/**
 * A slim trading bar, the same on every market page:
 *   [kit] NAME ..................................... PRICE (label)
 *         Tier | Club | Position ................ ▲ 4.2%  ╱╲╱ graph
 *         sold by Club · extra .......................... [actions]
 */
export function TradeRow({
  card,
  href,
  priceLabel,
  priceMinor,
  seller,
  extra,
  actions,
  tag,
}: {
  card: CardView;
  href?: string;
  priceLabel: string;
  priceMinor: number | null;
  seller: React.ReactNode;
  extra?: React.ReactNode;
  actions?: React.ReactNode;
  tag?: React.ReactNode;
}) {
  const h = card.history ?? [];
  const change = h.length > 1 && h[0] ? Math.round(((h[h.length - 1] - h[0]) / h[0]) * 1000) / 10 : null;
  const tier = card.finish ? (
    <span className={`flex items-center gap-1 ${FINISH_STYLE[card.finish.kind].name}`}>
      <Gem kind={card.finish.kind} id={`tr-${card.id}`} size={11} />
      {FINISH_STYLE[card.finish.kind].label} {card.finish.serial}/{card.finish.of}
    </span>
  ) : (
    <span className={TIER_TEXT[card.category]}>{card.category[0] + card.category.slice(1).toLowerCase()}</span>
  );
  const name = <span className="block truncate font-display text-[17px] font-black uppercase italic leading-tight tracking-wide">{card.name}</span>;
  return (
    <li className={`tier-${card.finish?.kind ?? card.category} relative flex gap-3 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 py-2.5 pl-3.5 pr-3 transition hover:border-ink-600`}>
      <span className="flex h-12 w-11 shrink-0 items-center justify-center self-center rounded-lg bg-ink-850">
        <KitShirt kit={card.kit} number={card.squadNumber} id={`tr-kit-${card.id}`} label={`${card.clubName ?? "Club"} shirt`} className="h-9 w-auto" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {/* 1: name · price */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 flex-1">{href ? <Link href={href} className="hover:text-lime">{name}</Link> : name}</span>
          <span className="shrink-0 text-right leading-none">
            <span className="mr-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-faint">{priceLabel}</span>
            <b className="font-display text-xl font-black italic tabular-nums text-lime">{priceMinor !== null ? `£${(priceMinor / 100).toFixed(2)}` : "—"}</b>
          </span>
        </div>
        {/* 2: tier | club | position · change + graph */}
        <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.08em]">
          <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            {tier}
            <span className="text-faint">|</span>
            <ClubBadge short={card.clubShort} primary={card.clubPrimary} secondary={card.clubSecondary} kit={card.kit} crestUrl={card.crestUrl} size={13} title={card.clubName ?? undefined} />
            <span className="min-w-0 truncate normal-case tracking-normal text-muted">{card.clubName ?? "Free agent"}</span>
            <span className="text-faint">|</span>
            <span className="text-fg">{POS_NAME[card.position]}</span>
            {tag}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {change !== null && <span className={`tabular-nums ${change > 0 ? "text-mint" : change < 0 ? "text-danger" : "text-faint"}`}>{change > 0 ? "▲" : change < 0 ? "▼" : "–"} {Math.abs(change)}%</span>}
            {h.length > 1 && (
              <span className="hidden sm:inline">
                <Sparkline points={h} width={64} height={18} />
              </span>
            )}
          </span>
        </div>
        {/* 3: seller · extra · actions */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
            {seller}
            {extra && <span className="text-faint"> · {extra}</span>}
          </span>
          {actions && <span className="flex max-w-full shrink-0 flex-wrap items-start justify-end gap-1.5 max-sm:w-full">{actions}</span>}
        </div>
      </div>
    </li>
  );
}
