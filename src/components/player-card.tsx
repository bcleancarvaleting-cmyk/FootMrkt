import type { CardView } from "@/lib/view";
import { FINISH_STYLE, Gem, GemFacets, GemSparkles, RainbowChant } from "./finish-art";
import { leagueShort, mpLabel } from "@/lib/view";
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
 * A MATCHX card face, the same everywhere: position (top left) and card number (top right), the kit,
 * the name, then Type | Club | League, one line of status, and £ value · Find · points for you.
 * Nothing sits on the kit. No FIFA-style ratings (spec §4.1).
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

        {/* Top: position (left) · card number (right) */}
        <div className={`relative flex items-center justify-between gap-1 ${small ? "px-2 pt-2" : "px-2.5 pt-2.5"}`}>
          <span className={`rounded-md bg-ink-950/75 px-1.5 py-0.5 font-black tracking-wider ${small ? "text-[10px]" : "text-xs"} ${t.text}`}>{card.position}</span>
          <CardNumber card={card} small={small} />
        </div>

        {/* Kit — nothing on top of it */}
        <div className={`relative flex min-h-0 flex-1 items-end justify-center overflow-hidden rounded-xl ${small ? "mx-2 mt-1" : "mx-2.5 mt-1.5"} ${gem ? "bg-gradient-to-b from-white/15 to-transparent" : "bg-gradient-to-b from-white/5 to-transparent"}`}>
          <PlayerImage card={card} />
        </div>

        {/* Name, then Type | Club | League */}
        <div className={`relative text-center ${small ? "px-2 pt-1" : "px-2.5 pt-1.5"}`}>
          <div className={`truncate font-display font-bold uppercase leading-tight tracking-wide ${small ? "text-[13px]" : size === "lg" ? "text-xl" : "text-[17px]"} ${finish ? FINISH_STYLE[finish.kind].name : ""}`}>{card.name}</div>
          {finish?.kind === "RAINBOW" && !small && <RainbowChant name={card.name} className="truncate text-[9px] tracking-wide" />}
          <div className={`mt-0.5 flex items-center justify-center whitespace-nowrap font-bold uppercase ${small ? "gap-0.5 text-[8px] tracking-[0.02em]" : "gap-1 text-[9px] tracking-[0.1em]"}`}>
            <span className={finish ? FINISH_STYLE[finish.kind].name : t.text}>{t.label}</span>
            <span className="text-faint">|</span>
            <span className="flex min-w-0 items-center gap-1 text-muted">
              {!small && <ClubBadge short={card.clubShort} primary={card.clubPrimary} secondary={card.clubSecondary} kit={card.kit} crestUrl={card.crestUrl} size={13} title={card.clubName ?? undefined} />}
              <span className={small ? "shrink-0" : "truncate"}>{small ? (card.clubShort || card.clubCode || "—") : (card.clubName ?? "Free agent")}</span>
            </span>
            {card.leagueName && (
              <>
                <span className="text-faint">|</span>
                <span className="text-faint">{leagueShort(card.leagueName)}</span>
              </>
            )}
          </div>
          {!showcase && <StatusLine card={card} small={small} />}
        </div>

        {/* £ value · Find · points won for you (left off posters) */}
        <div className={`relative ${small ? "mx-2 mb-1.5 mt-1 pt-1" : "mx-2.5 mb-2 mt-1.5 pt-1.5"} ${showcase ? "hidden" : "flex"} items-center gap-1 border-t border-white/10`}>
          <div className="min-w-0 flex-1">
            {card.loan ? (
              <div title="Loan players are free, untradeable and have no value">
                <div className="whitespace-nowrap text-[11px] font-bold text-lime">Loan</div>
                <div className="truncate text-[9px] text-faint">{card.loan.ended ? "Discard" : card.loan.left ? `${card.loan.left}/${card.loan.total} uses` : "Last use"}</div>
              </div>
            ) : (
              <div>
                <div className="whitespace-nowrap text-[11px] font-bold text-lime">{mpLabel(card.valueMp)}</div>
                <div className="truncate text-[9px] text-faint">{card.trendPct !== null ? <Trend pct={card.trendPct} /> : "value"}</div>
              </div>
            )}
          </div>
          <FindPlayer playerId={card.playerId} name={card.name} small inline />
          <div className="min-w-0 flex-1 text-right" title="Points this card has won for you in settled competitions">
            <div className={`text-[11px] font-black ${card.pointsForYou ? (card.pointsForYou > 0 ? "text-fg" : "text-danger") : "text-faint"}`}>{card.pointsForYou !== null ? `${formatPts(card.pointsForYou)} pts` : "—"}</div>
            <div className="truncate text-[9px] text-faint">{card.pointsForYou !== null ? "for you" : "points"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One tidy line of status under the name — the most important first, never over the kit. */
function StatusLine({ card, small }: { card: CardView; small: boolean }) {
  const items: Array<[string, string, string?]> = [];
  if (card.loan) items.push([card.loan.ended ? "Loan ended" : "On loan", card.loan.ended ? "text-warn" : "text-muted"]);
  if (card.lock === "COMPETITION") items.push(["In squad", "text-lime"]);
  if (card.lock === "LISTED") items.push(["Listed", "text-warn"]);
  if (card.totw) items.push(["★ TOTW", "text-gold", "Team of the Week — the badge lasts 7 days"]);
  if (card.risingPct) items.push(["▲ Rising", "text-mint", `Tipped to rise ~${card.risingPct}% at the next revaluation`]);
  if ((card.watchers ?? 0) > 0) items.push([`👁 ${card.watchers}`, "text-muted", `Watched by ${card.watchers} manager${card.watchers === 1 ? "" : "s"}`]);
  if (card.stamps > 0) items.push([`★ ${card.stamps}`, "text-muted", `${card.stamps} history stamp${card.stamps === 1 ? "" : "s"}`]);
  if (!card.loan && card.edition === "STARTER" && !card.tradeable) items.push(["Starter", "text-faint", "Free starter card — yours to play, can't be traded"]);
  const shown = items.slice(0, small ? 2 : 3);
  return (
    <div className={`flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap font-bold uppercase tracking-wide ${small ? "mt-0.5 h-3 text-[8px]" : "mt-1 h-3.5 text-[9px]"}`}>
      {shown.map(([label, tone, title], i) => (
        <span key={label} className={`flex items-center gap-1.5 ${tone}`} title={title}>
          {i > 0 && <span className="text-faint">·</span>}
          {label}
        </span>
      ))}
    </div>
  );
}

const formatPts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Every card carries its own number, so no two are alike: "147/500" for a Gold (147th of a possible
 * 500), "4/10" for a Ruby, "3/5" for a Diamond. Free starter and loan cards are numbered on their own.
 */
function CardNumber({ card, small }: { card: CardView; small: boolean }) {
  if (card.finish) {
    const f = card.finish;
    return (
      <span className="flex items-center gap-1 rounded-md bg-ink-950/75 px-1.5 py-0.5" title={`${FINISH_STYLE[f.kind].label} ${f.serial} of ${f.of}`}>
        <Gem kind={f.kind} id={`num-${card.id}`} size={small ? 11 : 13} />
        <span className={`font-black tabular-nums ${FINISH_STYLE[f.kind].name} ${small ? "text-[10px]" : "text-xs"}`}>
          {f.serial}/{f.of.toLocaleString("en-GB")}
        </span>
      </span>
    );
  }
  const [num, of] = card.edition === "STANDARD" ? [card.serial, card.maxSupply] : [card.serial, null];
  if (!num) return null;
  return (
    <span className={`rounded-md bg-ink-950/75 px-1.5 py-0.5 tabular-nums ${small ? "text-[10px]" : "text-xs"}`} title={of ? `Number ${num} of ${of}` : `Number ${num}`}>
      <span className="font-semibold text-faint">#</span>
      <b className="font-black text-fg">{num}</b>
      {of ? <span className="text-faint">/{of.toLocaleString("en-GB")}</span> : null}
    </span>
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

export function CategoryDot({ category }: { category: CardView["category"] }) {
  const c = category === "GOLD" ? "bg-gold" : category === "SILVER" ? "bg-silver" : "bg-bronze";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} />;
}
