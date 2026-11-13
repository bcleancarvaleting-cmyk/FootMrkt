import { PackLeagueLogos } from "./pack-league-logos";

/**
 * A sealed MATCHX pack, drawn like the real thing: foil wrapper with crimped ends, the England
 * flag, the tier in big italic type and a price tag.
 */
const TEETH = 14;
const crimp = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= TEETH * 2; i++) pts.push(`${((i / (TEETH * 2)) * 100).toFixed(2)}% ${i % 2 ? 0 : 2.2}%`);
  for (let i = TEETH * 2; i >= 0; i--) pts.push(`${((i / (TEETH * 2)) * 100).toFixed(2)}% ${i % 2 ? 100 : 97.8}%`);
  return `polygon(${pts.join(",")})`;
})();

const TIER_INK: Record<PackTier, string> = {
  bronze: "linear-gradient(180deg,#ffd6b0,#e0a46a 45%,#9a5a2c)",
  silver: "linear-gradient(180deg,#ffffff,#d9dee4 45%,#8d96a1)",
  gold: "linear-gradient(180deg,#fff5c4,#f2cf63 45%,#a87a1e)",
  rare: "linear-gradient(90deg,#ff5f9e,#ffb35c,#f6ff6b,#5dffa8,#5cc8ff,#a66bff)",
};
export type PackTier = "bronze" | "silver" | "gold" | "rare";

/**
 * Premium pack: foil wrapper with crimped seals, a glossy highlight, league logos, and a dark
 * glass band carrying the tier in foil lettering. The Rare pack is rainbow foil with a halo.
 */
export function PackWrapper({ tier, price, className = "", style, leagues }: { tier: PackTier; price?: string; className?: string; style?: React.CSSProperties; /** League logos (only leagues the pack really holds). */ leagues?: Array<{ code: string; name: string; logoUrl: string | null }> }) {
  const rare = tier === "rare";
  return (
    <div className={`relative ${rare ? "rainbow-halo rounded-md" : ""} ${className}`} style={style}>
      <div
        className={`card-premium ${tier === "gold" || rare ? "is-gold" : ""} foil-${rare ? "rainbow" : tier} relative flex h-full w-full flex-col overflow-hidden shadow-[0_28px_60px_-18px_rgba(0,0,0,0.9)]`}
        style={{ clipPath: crimp }}
      >
        {/* crimped seals */}
        <span className="absolute inset-x-0 top-0 h-[9%] bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.2)_0_2px,transparent_2px_6px)]" aria-hidden="true" />
        <span className="absolute inset-x-0 bottom-0 h-[9%] bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.2)_0_2px,transparent_2px_6px)]" aria-hidden="true" />
        {/* gloss + inner edge */}
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.45)_0%,rgba(255,255,255,0.08)_28%,transparent_45%,rgba(0,0,0,0.18)_100%)]" aria-hidden="true" />
        <span className="pointer-events-none absolute inset-x-[6%] inset-y-[11%] rounded-sm ring-1 ring-white/35" aria-hidden="true" />
        <span className="sheen" aria-hidden="true" />
        {(tier === "gold" || rare) && <span className="holo" aria-hidden="true" />}
        <span className="relative mt-[14%] flex items-center justify-center gap-1.5 text-[8px] font-extrabold uppercase italic tracking-[0.2em] text-black/70 sm:text-[10px]">
          <svg viewBox="0 0 10 6" className="h-2 w-3.5 rounded-[1px] shadow-sm sm:h-2.5 sm:w-4" aria-hidden="true">
            <rect width="10" height="6" fill="#fff" />
            <rect x="4.2" width="1.6" height="6" fill="#ce1124" />
            <rect y="2.3" width="10" height="1.4" fill="#ce1124" />
          </svg>
          England
        </span>
        <span className="relative mt-[6%] text-center font-display text-[38px] font-black italic leading-none text-black/25 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)] sm:text-[56px]">X</span>
        {leagues?.some((l) => l.logoUrl) && (
          <span className="relative mt-[4%] flex justify-center px-1.5">
            <PackLeagueLogos leagues={leagues.filter((l) => l.logoUrl)} size="sm" />
          </span>
        )}
        {/* dark glass band with the tier in foil lettering */}
        <span className="relative mb-[20%] mt-auto bg-black/70 py-1.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm sm:py-2">
          <span className="block bg-clip-text font-display text-xl font-black uppercase italic leading-none text-transparent sm:text-3xl" style={{ backgroundImage: TIER_INK[tier] }}>
            {tier}
          </span>
          <span className="mt-0.5 block text-[7px] font-black uppercase tracking-[0.22em] text-white/70 sm:text-[9px]">{rare ? "Special guaranteed" : "MATCHX pack"}</span>
        </span>
      </div>
      {price && <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0b0e0c] px-3 py-1 text-xs font-black tabular-nums text-white shadow-lg ring-1 ring-white/20">{price}</span>}
    </div>
  );
}
