/**
 * An original, generic floodlit stadium at night (no real ground's architecture or branding).
 * Pure SVG so it stays sharp at any size and costs nothing to load.
 */
// Speckled crowd: deterministic pseudo-random dots across the stands (computed once).
const CROWD = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 520 }, () => {
    const x = rnd() * 1600;
    const y = 360 + rnd() * 170 + Math.sin(x / 260) * 6;
    const lit = rnd() > 0.93;
    const shade = rnd() > 0.5 ? "#2c333b" : "#3b434d";
    return { x: x.toFixed(1), y: y.toFixed(1), r: lit ? 1.6 : 1.1, fill: lit ? "#f4f5f2" : shade, o: lit ? 0.9 : 0.8 };
  });
})();

export function StadiumScene({ className = "" }: { className?: string }) {
  const stripes = Array.from({ length: 12 }, (_, i) => {
    const t0 = i / 12;
    const t1 = (i + 1) / 12;
    const topL = 430 + t0 * 740;
    const topR = 430 + t1 * 740;
    const botL = -260 + t0 * 2120;
    const botR = -260 + t1 * 2120;
    return <path key={i} d={`M${topL},560 L${topR},560 L${botR},900 L${botL},900 Z`} fill={i % 2 ? "#1d6b2d" : "#237a34"} />;
  });
  const tower = (x: number, flip: boolean) => (
    <g transform={`translate(${x} 0) scale(${flip ? -1 : 1} 1)`}>
      <path d="M0,520 L10,150 L18,150 L30,520 Z" fill="#14181d" />
      <rect x="-26" y="112" width="84" height="44" rx="4" fill="#1b2027" />
      {[0, 1, 2, 3].map((c) =>
        [0, 1].map((r) => <rect key={`${c}${r}`} x={-20 + c * 19} y={118 + r * 18} width="15" height="13" rx="2" fill="#fbfff0" />),
      )}
      <ellipse cx="16" cy="134" rx="150" ry="70" fill="url(#flare)" />
    </g>
  );
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label="A packed football stadium under floodlights">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05070a" />
          <stop offset="0.55" stopColor="#0d1a12" />
          <stop offset="1" stopColor="#16301c" />
        </linearGradient>
        <radialGradient id="flare">
          <stop offset="0" stopColor="#f6ffd6" stopOpacity="0.85" />
          <stop offset="0.35" stopColor="#adfc07" stopOpacity="0.18" />
          <stop offset="1" stopColor="#adfc07" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pitchGlow" cx="0.5" cy="0.2" r="0.7">
          <stop offset="0" stopColor="#d7ff8a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#060708" stopOpacity="0" />
          <stop offset="1" stopColor="#060708" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#sky)" />
      {/* Roof canopy */}
      <path d="M-40,300 Q800,190 1640,300 L1640,350 Q800,250 -40,350 Z" fill="#0f1317" />
      <path d="M-40,350 Q800,250 1640,350" stroke="#2a3139" strokeWidth="3" fill="none" />
      {/* Upper and lower tiers */}
      <path d="M-40,350 Q800,250 1640,350 L1640,450 Q800,380 -40,450 Z" fill="#161b21" />
      <path d="M-40,452 Q800,382 1640,452 L1640,560 L-40,560 Z" fill="#1b2128" />
      <path d="M-40,450 Q800,380 1640,450" stroke="#adfc07" strokeOpacity="0.55" strokeWidth="2" fill="none" />
      {CROWD.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={c.fill} opacity={c.o} />
      ))}
      {/* Advertising board */}
      <rect x="-40" y="548" width="1680" height="14" fill="#0a0d10" />
      <rect x="-40" y="552" width="1680" height="4" fill="#adfc07" opacity="0.6" />
      {stripes}
      <rect y="560" width="1600" height="340" fill="url(#pitchGlow)" />
      {/* Pitch markings */}
      <g stroke="#e9f5e0" strokeOpacity="0.75" strokeWidth="2.5" fill="none">
        <path d="M430,560 L1170,560 L1860,900 L-260,900 Z" />
        <path d="M290,640 L1310,640" />
        <ellipse cx="800" cy="690" rx="210" ry="46" />
        <path d="M640,560 L660,585 L940,585 L960,560" />
      </g>
      {tower(170, false)}
      {tower(1430, true)}
      <rect width="1600" height="900" fill="url(#fade)" />
    </svg>
  );
}
