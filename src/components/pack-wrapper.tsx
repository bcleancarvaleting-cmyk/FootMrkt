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

export function PackWrapper({ tier, price, className = "", style, leagues }: { tier: "bronze" | "silver" | "gold"; price?: string; className?: string; style?: React.CSSProperties; /** League logos (only leagues the pack really holds). */ leagues?: Array<{ code: string; name: string; logoUrl: string | null }> }) {
  return (
    <div className={`relative ${className}`} style={style}>
      <div className={`card-premium ${tier === "gold" ? "is-gold" : ""} foil-${tier} relative flex h-full w-full flex-col overflow-hidden shadow-[0_24px_50px_-18px_rgba(0,0,0,0.85)]`} style={{ clipPath: crimp }}>
        {/* crimped seals */}
        <span className="absolute inset-x-0 top-0 h-[9%] bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.18)_0_2px,transparent_2px_6px)]" aria-hidden="true" />
        <span className="absolute inset-x-0 bottom-0 h-[9%] bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.18)_0_2px,transparent_2px_6px)]" aria-hidden="true" />
        <span className="sheen" aria-hidden="true" />
        {tier === "gold" && <span className="holo" aria-hidden="true" />}
        <span className="relative mt-[14%] flex items-center justify-center gap-1.5 text-[9px] font-extrabold uppercase italic tracking-[0.2em] text-black/65 sm:text-[10px]">
          <svg viewBox="0 0 10 6" className="h-2.5 w-4 rounded-[1px] shadow-sm" aria-hidden="true">
            <rect width="10" height="6" fill="#fff" />
            <rect x="4.2" width="1.6" height="6" fill="#ce1124" />
            <rect y="2.3" width="10" height="1.4" fill="#ce1124" />
          </svg>
          England
        </span>
        <span className="relative mt-[10%] text-center font-display text-[44px] font-black italic leading-none text-black/20 sm:text-[56px]">X</span>
        {leagues?.some((l) => l.logoUrl) && (
          <span className="relative mt-[6%] flex justify-center px-2">
            <PackLeagueLogos leagues={leagues.filter((l) => l.logoUrl)} size="sm" />
          </span>
        )}
        <span className="relative mt-auto mb-[16%] text-center">
          <span className="block font-display text-2xl font-black uppercase italic leading-none text-black/80 sm:text-3xl">{tier}</span>
          <span className="mt-1 block text-[9px] font-black uppercase tracking-[0.2em] text-black/55">MATCHX pack</span>
        </span>
      </div>
      {price && <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-[#0b0e0c] px-3 py-1 text-xs font-black tabular-nums text-white shadow-lg ring-1 ring-white/15">{price}</span>}
    </div>
  );
}
