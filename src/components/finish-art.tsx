/**
 * Artwork for the special finishes (Ruby, Diamond): a brilliant-cut gem, a crystal facet face, star
 * sparkles and a shimmer sweep. Pure SVG/CSS, so it stays crisp at any size and works in server
 * components. Purely cosmetic — a Ruby or Diamond is otherwise the same Gold card.
 */

export type Finish = "RUBY" | "DIAMOND" | "RAINBOW";

/** Names, CSS styles, numbers-in-words and reveal timing for each finish — one place to change them. */
export const FINISH_STYLE: Record<Finish, { label: string; halo: string; name: string; text: string; shadow: string; word: string; rank: number; pause: number }> = {
  RUBY: { label: "Ruby", halo: "ruby-halo", name: "ruby-name", text: "text-[#ff8fa6]", shadow: "drop-shadow-[0_0_14px_rgba(255,45,85,0.9)]", word: "twenty", rank: 3, pause: 1300 },
  DIAMOND: { label: "Diamond", halo: "diamond-halo", name: "diamond-name", text: "text-[#8fe3ff]", shadow: "drop-shadow-[0_0_14px_rgba(155,232,255,0.9)]", word: "ten", rank: 4, pause: 1800 },
  RAINBOW: { label: "Rainbow", halo: "rainbow-halo", name: "rainbow-name", text: "rainbow-name", shadow: "drop-shadow-[0_0_18px_rgba(255,255,255,0.9)]", word: "one", rank: 5, pause: 2600 },
};

const GEM: Record<Finish, { light: string; mid: string; dark: string; tint: string; deep: string; edge: string }> = {
  DIAMOND: { light: "#ffffff", mid: "#bfefff", dark: "#7cc8f2", tint: "#e9e1ff", deep: "#8fb0f5", edge: "#ffffff" },
  RUBY: { light: "#ffd6e0", mid: "#ff5a7a", dark: "#b0102f", tint: "#ff8fa6", deep: "#7a0820", edge: "#ffe3ea" },
  RAINBOW: { light: "#fff6b0", mid: "#7cf0c8", dark: "#5a8dff", tint: "#ff9ad5", deep: "#a05bff", edge: "#ffffff" },
};

/** A brilliant-cut gem, seen side-on: crown on top, pavilion below, with light and shade on each facet. */
export function Gem({ kind = "DIAMOND", size = 20, id, className = "" }: { kind?: Finish; size?: number; id: string; className?: string }) {
  const g = `gem-${kind}-${id}`;
  const c = GEM[kind];
  return (
    <svg viewBox="0 0 64 56" width={size} height={(size * 56) / 64} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${g}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.light} />
          <stop offset="0.45" stopColor={c.mid} />
          <stop offset="1" stopColor={c.dark} />
        </linearGradient>
        <linearGradient id={`${g}-b`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.tint} />
          <stop offset="1" stopColor={c.deep} />
        </linearGradient>
      </defs>
      <polygon points="14,4 50,4 62,18 2,18" fill={`url(#${g}-a)`} />
      <polygon points="14,4 24,18 2,18" fill={c.mid} opacity="0.8" />
      <polygon points="50,4 40,18 62,18" fill={c.dark} />
      <polygon points="14,4 32,4 24,18" fill={c.light} />
      <polygon points="32,4 50,4 40,18" fill={c.tint} />
      <polygon points="24,18 32,4 40,18" fill={c.light} opacity="0.9" />
      <polygon points="2,18 62,18 32,54" fill={`url(#${g}-b)`} />
      <polygon points="2,18 24,18 32,54" fill={c.mid} />
      <polygon points="24,18 40,18 32,54" fill={c.light} opacity="0.75" />
      <polygon points="40,18 62,18 32,54" fill={c.deep} />
      <path d="M14 4 H50 L62 18 L32 54 L2 18 Z M2 18 H62 M24 18 L32 54 L40 18 M14 4 L24 18 L32 4 L40 18 L50 4" fill="none" stroke={c.edge} strokeOpacity="0.85" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M46 7 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6z" fill="#fff" />
    </svg>
  );
}

// A brilliant-cut facet mesh centred behind the player: rings of triangles radiating from the middle.
const CX = 50;
const CY = 58;
const RINGS = [0, 13, 30, 58, 110];
const SECTORS = 16;
const PALETTES: Record<Finish, string[]> = {
  DIAMOND: ["#d8f5ff", "#9fd6f5", "#6fa8e6", "#c9b8ff", "#ffffff", "#7fd0e8", "#b7c7ff", "#e8fbff"],
  RUBY: ["#ff9fb2", "#e0284f", "#9c0a2a", "#ff5f7e", "#ffd3dc", "#c4143c", "#ff7a95", "#ffe6ec"],
  RAINBOW: ["#ff5f6d", "#ffb347", "#ffe66d", "#7cf0a0", "#5fd4ff", "#6c8cff", "#b47cff", "#ff8fd8"],
};
const point = (r: number, i: number, offset: number) => {
  const a = ((i + offset) / SECTORS) * Math.PI * 2 - Math.PI / 2;
  return `${(CX + r * Math.cos(a)).toFixed(2)},${(CY + r * Math.sin(a) * 1.15).toFixed(2)}`;
};
function facets(palette: string[]) {
  const out: Array<{ points: string; fill: string; opacity: number }> = [];
  for (let ring = 0; ring < RINGS.length - 1; ring++) {
    const inner = RINGS[ring];
    const outer = RINGS[ring + 1];
    for (let i = 0; i < SECTORS; i++) {
      const off = ring % 2 ? 0.5 : 0; // alternate the cut on each ring, like a real brilliant
      const seed = (ring * 7 + i * 5) % palette.length;
      const fade = ring === 0 ? 0.55 : ring === 1 ? 0.42 : ring === 2 ? 0.3 : 0.2;
      out.push({ points: `${point(inner, i, off)} ${point(outer, i, off)} ${point(outer, i + 1, off)}`, fill: palette[seed], opacity: fade * (0.55 + ((i * 3 + ring) % 5) / 10) });
      if (inner > 0) out.push({ points: `${point(inner, i, off)} ${point(inner, i + 1, off)} ${point(outer, i + 1, off)}`, fill: palette[(seed + 3) % palette.length], opacity: fade * 0.7 });
    }
  }
  return out;
}
const FACETS: Record<Finish, ReturnType<typeof facets>> = { DIAMOND: facets(PALETTES.DIAMOND), RUBY: facets(PALETTES.RUBY), RAINBOW: facets(PALETTES.RAINBOW) };

/** The crystal facets that fill a Ruby or Diamond card's face. */
export function GemFacets({ kind }: { kind: Finish }) {
  return (
    <svg viewBox="0 0 100 140" preserveAspectRatio="none" className={`pointer-events-none absolute inset-0 h-full w-full ${kind === "RAINBOW" ? "rainbow-facets" : ""}`} aria-hidden="true">
      {FACETS[kind].map((f, i) => (
        <polygon key={i} points={f.points} fill={f.fill} opacity={f.opacity} stroke="#ffffff" strokeOpacity="0.12" strokeWidth="0.25" />
      ))}
    </svg>
  );
}

/** Four-pointed star sparkles that twinkle across the card, and a band of light that sweeps over it. */
export function GemSparkles({ kind }: { kind: Finish }) {
  const stars = [
    { x: "12%", y: "18%", s: 14, d: "0s" },
    { x: "80%", y: "30%", s: 10, d: "0.7s" },
    { x: "22%", y: "62%", s: 9, d: "1.3s" },
    { x: "72%", y: "70%", s: 13, d: "0.35s" },
    { x: "48%", y: "12%", s: 8, d: "1.8s" },
    { x: "88%", y: "86%", s: 8, d: "1.1s" },
  ];
  return (
    <>
      <span className="gem-shimmer" aria-hidden="true" />
      {stars.map((st, i) => (
        <svg key={i} viewBox="0 0 20 20" width={st.s} height={st.s} className={`gem-star gem-star-${kind.toLowerCase()}`} style={{ left: st.x, top: st.y, animationDelay: st.d }} aria-hidden="true">
          <path d="M10 0 C11 7 13 9 20 10 C13 11 11 13 10 20 C9 13 7 11 0 10 C7 9 9 7 10 0 Z" fill="#ffffff" />
        </svg>
      ))}
    </>
  );
}

/** Pill label for a finish — "Ruby 3 of 10" / "Diamond 2 of 5" — with its gem. */
export function FinishPill({ finish, id, size = "sm", className = "" }: { finish: { kind: Finish; serial: number; of: number }; id: string; size?: "xs" | "sm" | "lg"; className?: string }) {
  const label = FINISH_STYLE[finish.kind].label;
  const cls = size === "lg" ? "px-3 py-1 text-[11px] tracking-[0.18em]" : size === "sm" ? "px-1.5 text-[10px] tracking-[0.12em]" : "px-1.5 py-0.5 text-[9px] tracking-wider";
  return (
    <span className={`gem-pill gem-pill-${finish.kind.toLowerCase()} inline-flex items-center gap-1 whitespace-nowrap rounded-full font-black uppercase ${cls} ${className}`}>
      <Gem kind={finish.kind} id={id} size={size === "lg" ? 16 : size === "sm" ? 12 : 11} />
      {finish.kind === "RAINBOW" ? (size === "xs" ? "1 of 1" : "Rainbow · 1 of 1") : size === "xs" ? `${finish.serial} of ${finish.of}` : `${label} ${finish.serial} of ${finish.of}`}
    </span>
  );
}
