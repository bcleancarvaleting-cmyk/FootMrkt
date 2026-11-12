import type { CardView } from "@/lib/view";
import { FINISH_STYLE, FinishPill, Gem, GemFacets, GemSparkles, RainbowChant } from "./finish-art";
import { mpLabel } from "@/lib/view";
import { ClubBadge } from "./club-badge";
import { FindPlayer } from "./find-player";
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
  RAINBOW: {
    frame: "",
    ring: "ring-white/70",
    text: "text-white",
    label: "Rainbow",
  },
  RUBY: {
    frame: "",
    ring: "ring-[#ff2d55]/60",
    text: "text-[#ffe3ea]",
    label: "Ruby",
  },
  DIAMOND: {
    frame: "",
    ring: "ring-[#8fe3ff]/60",
    text: "text-[#e6f9ff]",
    label: "Diamond",
  },
} as const;

export function tierStyle(c: CardView["category"]) {
  return TIER[c];
}

/**
 * A MATCHX card face: position, player image, name, MX value (with trend) and the points this
 * card has won for its owner. No FIFA-style ratings (spec §4.1).
 * The image is the licensed headshot when one is set (Player.imageUrl); until image rights are
 * in place it shows the player's shirt in club colours with their squad number.
 */
export function PlayerCard({ card, size = "md", className = "", showcase = false }: { card: CardView; size?: "sm" | "md" | "lg"; className?: string; /** Posters: no prices, points or status badges. */ showcase?: boolean }) {
  // Ruby and Diamond are finishes on a Gold: same card in every way, it just looks the part.
  const finish = card.finish ?? null;
  const gem = finish !== null;
  const t = finish ? TIER[finish.kind] : TIER[card.category];
  const w = size === "sm" ? "w-32" : size === "lg" ? "w-60" : "w-44";
  const small = size === "sm";
  const tier = finish ? finish.kind.toLowerCase() : card.category.toLowerCase();
  return (
    <div
      className={`card-premium theme-dark relative ${w} aspect-[5/7] ${card.loan?.ended ? "loan-ended" : ""} select-none overflow-hidden rounded-[18px] ${gem ? "p-[6px]" : "p-[3px]"} foil-${tier} ${
        finish
          ? `is-gold ${FINISH_STYLE[finish.kind].halo}`
          : card.category === "GOLD" && !card.loan?.ended
            ? "is-gold shadow-[0_10px_40px_-12px_rgba(242,207,99,0.7)]"
            : "shadow-[0_10px_30px_-16px_rgba(0,0,0,0.8)]"
      } ${className}`}
    >
      <span className="sheen" aria-hidden="true" />
      <div className={`face-${tier} relative flex h-full flex-col overflow-hidden rounded-[15px]`}>
        {finish && <GemFacets kind={finish.kind} />}
        {(card.category === "GOLD" || gem) && <span className={`holo ${gem ? "!opacity-60" : ""}`} aria-hidden="true" />}
        {finish && <GemSparkles kind={finish.kind} />}
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
          {finish ? (
            <span className="flex items-center gap-1">
              <Gem kind={finish.kind} id={`tier-${card.id}`} size={small ? 14 : 18} />
              {!small && <span className={`${FINISH_STYLE[finish.kind].name} text-[9px] font-black uppercase tracking-[0.18em]`}>{t.label}</span>}
            </span>
          ) : (
            <span className={`text-[9px] font-bold uppercase tracking-[0.18em] ${t.text}`}>{t.label}</span>
          )}
        </div>

        {/* Player image */}
        <div className={`relative mx-2.5 mt-1.5 flex flex-1 items-end justify-center overflow-hidden rounded-xl ${gem ? "bg-gradient-to-b from-white/15 to-transparent" : "bg-gradient-to-b from-white/5 to-transparent"}`}>
          <PlayerImage card={card} />
          {!showcase && (
          <div className="pointer-events-none absolute left-1 top-1 flex flex-col items-start gap-1">
            {finish && <FinishPill finish={finish} id={`badge-${card.id}`} size="xs" />}
            {card.stamps > 0 && (
              <span title={`${card.stamps} history stamp${card.stamps === 1 ? "" : "s"}`}>
                <Badge tone="muted">★ {card.stamps}</Badge>
              </span>
            )}
            {card.risingPct && (
              <span title={`Tipped to rise ~${card.risingPct}% at the next revaluation`}>
                <Badge tone="lime">📈 Rising</Badge>
              </span>
            )}
            {(card.watchers ?? 0) > 0 && (
              <span title={`Watched by ${card.watchers} manager${card.watchers === 1 ? "" : "s"}`}>
                <Badge tone="muted">👁 {card.watchers}</Badge>
              </span>
            )}
            {card.lock === "COMPETITION" && <Badge tone="lime">In squad</Badge>}
            {card.lock === "LISTED" && <Badge tone="warn">Listed</Badge>}
            {card.loan && (card.loan.ended ? <Badge tone="warn">Loan ended</Badge> : <Badge tone="muted">On loan</Badge>)}
          </div>
          )}
          {!showcase && <FindPlayer playerId={card.playerId} name={card.name} small={small} />}
          {showcase && finish && (
            <div className="pointer-events-none absolute left-1 top-1">
              <FinishPill finish={finish} id={`badge-${card.id}`} size="xs" />
            </div>
          )}
          {card.totw && (
            <span
              title="Team of the Week — the badge lasts 7 days"
              className={`pointer-events-none absolute bottom-1 right-1 rounded-md bg-gradient-to-r from-[#f2cf63] to-[#adfc07] font-black uppercase italic tracking-wider text-[#0a0d02] shadow-[0_2px_10px_rgba(242,207,99,0.55)] ${small ? "px-1 text-[8px]" : "px-1.5 py-0.5 text-[10px]"}`}
            >
              ★ TOTW
            </span>
          )}
          {(card.acquired || card.edition === "STARTER") && !card.loan && !small && !showcase && (
            <span className="absolute right-1 top-1 rounded bg-ink-950/85 px-1.5 text-[9px] font-semibold text-muted">
              {card.tradeable ? card.acquired : `${card.acquired ?? "Starter"} · locked`}
            </span>
          )}
        </div>

        {/* Name */}
        <div className="px-2.5 pt-1.5 text-center">
          <div className={`truncate font-display font-bold uppercase leading-tight tracking-wide ${small ? "text-sm" : "text-[17px]"} ${finish ? FINISH_STYLE[finish.kind].name : ""}`}>{card.name}</div>
          {finish?.kind === "RAINBOW" && !small && <RainbowChant name={card.name} className="truncate text-[9px] tracking-wide" />}
          <div className="truncate text-[10px] text-muted">{card.clubName ?? "Free agent"}</div>
          {card.leagueName && <div className="truncate text-[8.5px] font-bold uppercase leading-tight tracking-[0.14em] text-faint">{card.leagueName}</div>}
          <CardNumber card={card} />
        </div>

        {/* £ value · points won for you (left off posters) */}
        <div className={`mx-2.5 mb-2 mt-1.5 ${showcase ? "hidden" : "grid"} grid-cols-2 gap-1 border-t border-white/10 pt-1.5`}>
          {card.loan ? (
            <div className="min-w-0" title="Loan players are free, untradeable and have no value">
              <div className="whitespace-nowrap text-[11px] font-bold text-lime">Loan</div>
              <div className="truncate text-[9px] text-faint">
                {card.loan.ended ? "Discard loan player" : card.loan.left ? `${card.loan.left} of ${card.loan.total} uses left` : "Last use played"}
              </div>
            </div>
          ) : (
            <div className="min-w-0">
              <div className="flex items-baseline gap-1 whitespace-nowrap text-[11px] font-bold text-lime">
                {mpLabel(card.valueMp)} <Trend pct={card.trendPct} />
              </div>
              <div className="truncate text-[9px] text-faint">value</div>
            </div>
          )}
          <div className="min-w-0 text-right" title="Points this card has won for you in settled competitions">
            <div className={`text-[11px] font-black ${card.pointsForYou ? (card.pointsForYou > 0 ? "text-fg" : "text-danger") : "text-faint"}`}>
              {card.pointsForYou !== null ? `${formatPts(card.pointsForYou)} pts` : "—"}
            </div>
            <div className="truncate text-[9px] text-faint">{card.pointsForYou !== null ? "won for you" : "points"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const formatPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Every card carries its own number, so no two are alike: "147/500" for a Gold (147th of a possible
 * 500), "4/10" for a Ruby, "3/5" for a Diamond. Free starter and loan cards are numbered on their own.
 */
function CardNumber({ card }: { card: CardView }) {
  const [num, of, label] = card.finish
    ? [card.finish.serial, card.finish.of, FINISH_STYLE[card.finish.kind].label]
    : card.edition === "LOAN"
      ? [card.serial, null, "Loan"]
      : card.edition === "STARTER"
        ? [card.serial, null, "Starter"]
        : [card.serial, card.maxSupply, "No."];
  if (!num) return <div className="h-4" />;
  return (
    <div className="mt-0.5 flex h-4 items-center justify-center gap-1 text-[10px] tabular-nums" title={of ? `Number ${num} of ${of}` : `Number ${num}`}>
      <span className="font-semibold uppercase tracking-wider text-faint">{label}</span>
      <span className="font-black text-fg">{num}</span>
      {of ? <span className="text-faint">/ {of.toLocaleString("en-GB")}</span> : null}
    </div>
  );
}


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
  const cls = tone === "lime" ? "bg-lime text-ink-950" : tone === "warn" ? "bg-warn text-ink-950" : "bg-ink-950/80 text-muted border border-ink-600";
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>{children}</span>;
}

export function CategoryDot({ category }: { category: CardView["category"] }) {
  const c = category === "GOLD" ? "bg-gold" : category === "SILVER" ? "bg-silver" : "bg-bronze";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} />;
}
