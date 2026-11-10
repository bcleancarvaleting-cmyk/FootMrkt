/**
 * Artwork for the Diamond finish: a brilliant-cut gem, a crystal facet face and star sparkles.
 * Pure SVG (no images), so it stays crisp at any card size and works in server components.
 */

/** A brilliant-cut diamond, seen side-on: crown on top, pavilion below, with light and shade on each facet. */
export function DiamondGem({ size = 20, id, className = "" }: { size?: number; id: string; className?: string }) {
  const g = `gem-${id}`;
  return (
    <svg viewBox="0 0 64 56" width={size} height={(size * 56) / 64} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${g}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#bfefff" />
          <stop offset="1" stopColor="#7cc8f2" />
        </linearGradient>
        <linearGradient id={`${g}-b`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9e1ff" />
          <stop offset="1" stopColor="#8fb4ff" />
        </linearGradient>
      </defs>
      {/* Crown (top) */}
      <polygon points="14,4 50,4 62,18 2,18" fill={`url(#${g}-a)`} />
      <polygon points="14,4 24,18 2,18" fill="#dff7ff" />
      <polygon points="50,4 40,18 62,18" fill="#a9d8ff" />
      <polygon points="14,4 32,4 24,18" fill="#ffffff" />
      <polygon points="32,4 50,4 40,18" fill="#cfeaff" />
      <polygon points="24,18 32,4 40,18" fill="#f4fdff" />
      {/* Pavilion (bottom) */}
      <polygon points="2,18 62,18 32,54" fill={`url(#${g}-b)`} />
      <polygon points="2,18 24,18 32,54" fill="#c2e9ff" />
      <polygon points="24,18 40,18 32,54" fill="#ffffff" opacity="0.9" />
      <polygon points="40,18 62,18 32,54" fill="#8fb0f5" />
      {/* Edges and a glint */}
      <path d="M14 4 H50 L62 18 L32 54 L2 18 Z M2 18 H62 M24 18 L32 54 L40 18 M14 4 L24 18 L32 4 L40 18 L50 4" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M46 7 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6z" fill="#fff" />
    </svg>
  );
}

// A brilliant-cut facet mesh centred behind the player: rings of triangles radiating from the middle.
const CX = 50;
const CY = 58;
const RINGS = [0, 13, 30, 58, 110];
const SECTORS = 16;
const PALETTE = ["#d8f5ff", "#9fd6f5", "#6fa8e6", "#c9b8ff", "#ffffff", "#7fd0e8", "#b7c7ff", "#e8fbff"];
const point = (r: number, i: number, offset: number) => {
  const a = ((i + offset) / SECTORS) * Math.PI * 2 - Math.PI / 2;
  return `${(CX + r * Math.cos(a)).toFixed(2)},${(CY + r * Math.sin(a) * 1.15).toFixed(2)}`;
};
const FACETS: Array<{ points: string; fill: string; opacity: number }> = [];
for (let ring = 0; ring < RINGS.length - 1; ring++) {
  const inner = RINGS[ring];
  const outer = RINGS[ring + 1];
  for (let i = 0; i < SECTORS; i++) {
    const off = ring % 2 ? 0.5 : 0; // alternate the cut on each ring, like a real brilliant
    const seed = (ring * 7 + i * 5) % PALETTE.length;
    const fade = ring === 0 ? 0.55 : ring === 1 ? 0.42 : ring === 2 ? 0.3 : 0.2;
    FACETS.push({ points: `${point(inner, i, off)} ${point(outer, i, off)} ${point(outer, i + 1, off)}`, fill: PALETTE[seed], opacity: fade * (0.55 + ((i * 3 + ring) % 5) / 10) });
    if (inner > 0) FACETS.push({ points: `${point(inner, i, off)} ${point(inner, i + 1, off)} ${point(outer, i + 1, off)}`, fill: PALETTE[(seed + 3) % PALETTE.length], opacity: fade * 0.7 });
  }
}

/** The crystal facets that fill a Diamond card's face. */
export function DiamondFacets() {
  return (
    <svg viewBox="0 0 100 140" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {FACETS.map((f, i) => (
        <polygon key={i} points={f.points} fill={f.fill} opacity={f.opacity} stroke="#ffffff" strokeOpacity="0.12" strokeWidth="0.25" />
      ))}
    </svg>
  );
}

/** Four-pointed star sparkles that twinkle across the card. */
export function DiamondSparkles() {
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
      {stars.map((st, i) => (
        <svg key={i} viewBox="0 0 20 20" width={st.s} height={st.s} className="diamond-star" style={{ left: st.x, top: st.y, animationDelay: st.d }} aria-hidden="true">
          <path d="M10 0 C11 7 13 9 20 10 C13 11 11 13 10 20 C9 13 7 11 0 10 C7 9 9 7 10 0 Z" fill="#ffffff" />
        </svg>
      ))}
    </>
  );
}
