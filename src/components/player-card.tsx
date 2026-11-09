import type { CardView } from "@/lib/view";
import { moneyRef, mpLabel } from "@/lib/view";
import { ClubBadge } from "./club-badge";

const TIER = {
  BRONZE: {
    frame: "from-bronze via-bronze-deep to-[#2a1a10]",
    ring: "ring-bronze/50",
    text: "text-[#f3d2b8]",
    label: "Bronze",
  },
  SILVER: {
    frame: "from-silver via-silver-deep to-[#1d2127]",
    ring: "ring-silver/50",
    text: "text-white",
    label: "Silver",
  },
  GOLD: {
    frame: "from-gold via-gold-deep to-[#2a1f05]",
    ring: "ring-gold/60",
    text: "text-[#fff3c4]",
    label: "Gold",
  },
} as const;

export function tierStyle(c: CardView["category"]) {
  return TIER[c];
}

/**
 * A COLLECTR card. Identity, tier, club and indicative value only — no FIFA-style ratings or
 * attributes (spec §4.1). No player photography until image rights are confirmed (spec §10).
 */
export function PlayerCard({ card, size = "md", className = "" }: { card: CardView; size?: "sm" | "md" | "lg"; className?: string }) {
  const t = TIER[card.category];
  const initials = `${card.firstName[0] ?? ""}${card.lastName[0] ?? ""}`;
  const w = size === "sm" ? "w-32" : size === "lg" ? "w-60" : "w-44";
  return (
    <div
      className={`relative ${w} aspect-[3/4] select-none overflow-hidden rounded-2xl bg-gradient-to-b p-[2px] ring-1 ${t.frame} ${t.ring} ${
        card.category === "GOLD" ? "shadow-[0_0_24px_-6px_rgba(236,199,90,0.5)]" : ""
      } ${className}`}
    >
      <div className="relative flex h-full flex-col rounded-[14px] bg-gradient-to-b from-ink-850/40 via-ink-900/90 to-ink-950 p-2.5">
        <div className="flex items-start justify-between">
          <span className={`rounded-md bg-ink-950/70 px-1.5 py-0.5 text-[10px] font-black tracking-wider ${t.text}`}>{card.position}</span>
          <ClubBadge
            short={card.clubShort}
            primary={card.clubPrimary}
            secondary={card.clubSecondary}
            crestUrl={card.crestUrl}
            size={size === "sm" ? 16 : size === "lg" ? 28 : 20}
            title={card.clubName ?? undefined}
          />
          <span className={`text-[9px] font-bold uppercase tracking-[0.18em] ${t.text}`}>{t.label}</span>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div
            className={`flex aspect-square w-[52%] items-center justify-center rounded-full bg-gradient-to-br ${t.frame} text-ink-950 shadow-inner`}
          >
            <span className={`font-black ${size === "sm" ? "text-xl" : size === "lg" ? "text-4xl" : "text-2xl"} text-ink-950/80`}>
              {initials}
            </span>
          </div>
        </div>
        <div className="text-center">
          <div className={`truncate font-bold leading-tight ${size === "sm" ? "text-xs" : "text-sm"}`}>{card.name}</div>
          <div className="truncate text-[10px] text-muted">
            {card.clubName ?? "Free agent"}
          </div>
        </div>
        <div className="mt-1.5 flex items-end justify-between border-t border-white/10 pt-1.5">
          <div>
            <div className="flex items-baseline gap-1 text-[11px] font-bold text-lime">
              {mpLabel(card.valueMp)} <Trend pct={card.trendPct} />
            </div>
            <div className="text-[9px] text-faint">{moneyRef(card.valueMp)} indicative</div>
          </div>
          <div className="text-right text-[9px] text-faint">
            {card.acquired && <div className="font-semibold text-muted">{card.acquired}</div>}
            #{card.serial}
            {card.maxSupply ? `/${card.maxSupply}` : ""}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-8 flex flex-col items-center gap-1">
          {card.edition === "STARTER" && <Badge tone="muted">Starter · untradeable</Badge>}
          {card.lock === "COMPETITION" && <Badge tone="lime">In squad</Badge>}
          {card.lock === "LISTED" && <Badge tone="warn">Listed</Badge>}
        </div>
      </div>
    </div>
  );
}

/** ▲ rising / ▼ falling vs the previous valuation. */
export function Trend({ pct, className = "" }: { pct: number | null; className?: string }) {
  if (pct === null) return null;
  if (pct === 0) return <span className={`text-[9px] text-faint ${className}`}>– 0%</span>;
  const up = pct > 0;
  return (
    <span className={`text-[9px] font-bold ${up ? "text-mint" : "text-danger"} ${className}`} title="Change since the previous valuation">
      {up ? "▲" : "▼"} {Math.abs(pct)}%
    </span>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "muted" | "lime" | "warn" }) {
  const cls =
    tone === "lime" ? "bg-lime text-ink-950" : tone === "warn" ? "bg-warn text-ink-950" : "bg-ink-950/80 text-muted border border-ink-600";
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>{children}</span>;
}

export function CategoryDot({ category }: { category: CardView["category"] }) {
  const c = category === "GOLD" ? "bg-gold" : category === "SILVER" ? "bg-silver" : "bg-bronze";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} />;
}
