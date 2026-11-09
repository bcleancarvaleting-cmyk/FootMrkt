import type { CardView } from "@/lib/view";
import { moneyRef, mpLabel } from "@/lib/view";
import { ClubBadge } from "./club-badge";
import { KitShirt } from "./kit-shirt";

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
 * A COLLECTR card face: position, player image, name, MP value (with trend) and the points this
 * card has won for its owner. No FIFA-style ratings (spec §4.1).
 * The image is the licensed headshot when one is set (Player.imageUrl); until image rights are
 * in place it shows the player's shirt in club colours with their squad number.
 */
export function PlayerCard({ card, size = "md", className = "" }: { card: CardView; size?: "sm" | "md" | "lg"; className?: string }) {
  const t = TIER[card.category];
  const w = size === "sm" ? "w-32" : size === "lg" ? "w-60" : "w-44";
  const small = size === "sm";
  const tier = card.category.toLowerCase();
  return (
    <div
      className={`card-premium theme-dark relative ${w} aspect-[5/7] select-none overflow-hidden rounded-[18px] p-[3px] foil-${tier} ${
        card.category === "GOLD" ? "is-gold shadow-[0_10px_40px_-12px_rgba(242,207,99,0.7)]" : "shadow-[0_10px_30px_-16px_rgba(0,0,0,0.8)]"
      } ${className}`}
    >
      <span className="sheen" aria-hidden="true" />
      <div className={`face-${tier} relative flex h-full flex-col overflow-hidden rounded-[15px]`}>
        {card.category === "GOLD" && <span className="holo" aria-hidden="true" />}
        {/* Position · club · tier */}
        <div className="flex items-center justify-between px-2.5 pt-2.5">
          <span className={`rounded-md bg-ink-950/75 px-1.5 py-0.5 font-black tracking-wider ${small ? "text-[10px]" : "text-xs"} ${t.text}`}>
            {card.position}
          </span>
          <ClubBadge
            short={card.clubShort}
            primary={card.clubPrimary}
            secondary={card.clubSecondary}
            kit={card.kit}
            crestUrl={card.crestUrl}
            size={small ? 16 : size === "lg" ? 26 : 20}
            title={card.clubName ?? undefined}
          />
          <span className={`text-[9px] font-bold uppercase tracking-[0.18em] ${t.text}`}>{t.label}</span>
        </div>

        {/* Player image */}
        <div className="relative mx-2.5 mt-1.5 flex flex-1 items-end justify-center overflow-hidden rounded-xl bg-gradient-to-b from-white/5 to-transparent">
          <PlayerImage card={card} />
          <div className="pointer-events-none absolute left-1 top-1 flex flex-col items-start gap-1">
            {card.lock === "COMPETITION" && <Badge tone="lime">In squad</Badge>}
            {card.lock === "LISTED" && <Badge tone="warn">Listed</Badge>}
          </div>
          {(card.acquired || card.edition === "STARTER") && !small && (
            <span className="absolute right-1 top-1 rounded bg-ink-950/85 px-1.5 text-[9px] font-semibold text-muted">
              {card.tradeable ? card.acquired : `${card.acquired ?? "Starter"} · locked`}
            </span>
          )}
        </div>

        {/* Name */}
        <div className="px-2.5 pt-1.5 text-center">
          <div className={`truncate font-display font-bold uppercase leading-tight tracking-wide ${small ? "text-sm" : "text-[17px]"}`}>{card.name}</div>
          <div className="truncate text-[10px] text-muted">{card.clubName ?? "Free agent"}</div>
        </div>

        {/* MP value · points won for you */}
        <div className="mx-2.5 mb-2 mt-1.5 grid grid-cols-2 gap-1 border-t border-white/10 pt-1.5">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1 whitespace-nowrap text-[11px] font-bold text-lime">
              {mpLabel(card.valueMp)} <Trend pct={card.trendPct} />
            </div>
            <div className="truncate text-[9px] text-faint">{moneyRef(card.valueMp)}</div>
          </div>
          <div className="min-w-0 text-right" title="Points this card has won for you in settled competitions">
            {card.pointsForYou !== null ? (
              <>
                <div className={`text-[11px] font-black ${card.pointsForYou > 0 ? "text-fg" : card.pointsForYou < 0 ? "text-danger" : "text-faint"}`}>
                  {formatPts(card.pointsForYou)} pts
                </div>
                <div className="truncate text-[9px] text-faint">won for you</div>
              </>
            ) : (
              <div className="text-[9px] text-faint">
                #{card.serial}
                {card.maxSupply ? `/${card.maxSupply}` : ""}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const formatPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Licensed headshot if one is set; otherwise the player's home shirt with their squad number. */
export function PlayerImage({ card }: { card: CardView }) {
  if (card.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={card.imageUrl} alt={card.name} className="h-full w-full object-cover object-top" title={card.imageCredit ?? undefined} />;
  }
  return <KitShirt kit={card.kit} number={card.squadNumber} id={card.id} label={`${card.name} — ${card.clubName ?? "club"} home shirt`} className="h-[86%] w-auto max-w-full drop-shadow-[0_8px_14px_rgba(0,0,0,0.5)]" />;
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
