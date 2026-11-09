import { type Kit, ink, trim } from "@/lib/kit";

/**
 * The player's home shirt, drawn from the club's kit colours and pattern, with their squad
 * number. Generic shapes only: no club badges, sponsors or manufacturer marks.
 */
export function KitShirt({ kit, number, id, label, className = "" }: { kit: Kit; number: number | null; id: string; label: string; className?: string }) {
  const t = trim(kit);
  const clip = `shirt-${id}`;
  const body = "M22 30 L36 22 C41 29 59 29 64 22 L78 30 L78 92 L22 92 Z";
  // Plain shirts: number in a contrasting colour. Patterned shirts: white with a heavy dark outline,
  // like a real shirt number, so it reads over stripes and hoops.
  const patterned = kit.pattern !== "plain";
  const numberInk = patterned ? "#FFFFFF" : ink(kit.body);
  const numberStroke = patterned ? "#111111" : numberInk === "#FFFFFF" ? "rgb(0 0 0 / .35)" : "rgb(255 255 255 / .35)";
  return (
    <svg viewBox="0 0 100 92" className={className} role="img" aria-label={label}>
      <title>{label}</title>
      <defs>
        <clipPath id={clip}>
          <path d={body} />
        </clipPath>
      </defs>
      {/* sleeves */}
      <path d="M36 22 L22 30 L8 50 L20 58 L28 46 Z" fill={kit.sleeves} stroke="rgb(0 0 0 / .35)" strokeWidth="1" />
      <path d="M64 22 L78 30 L92 50 L80 58 L72 46 Z" fill={kit.sleeves} stroke="rgb(0 0 0 / .35)" strokeWidth="1" />
      <path d="M8 50 L20 58" stroke={t} strokeWidth="3" />
      <path d="M92 50 L80 58" stroke={t} strokeWidth="3" />
      {/* body + pattern */}
      <path d={body} fill={kit.body} />
      <g clipPath={`url(#${clip})`}>
        {kit.pattern === "stripes" &&
          [0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} x={20 + i * 9} y="18" width="4.5" height="80" fill={kit.patternColour ?? t} />)}
        {kit.pattern === "hoops" && [0, 1, 2, 3, 4].map((i) => <rect key={i} x="18" y={34 + i * 12} width="64" height="6" fill={kit.patternColour ?? t} />)}
        {kit.pattern === "halves" && <rect x="50" y="18" width="32" height="80" fill={kit.patternColour ?? t} />}
        {kit.pattern === "quarters" && (
          <>
            <rect x="50" y="18" width="32" height="38" fill={kit.patternColour ?? t} />
            <rect x="18" y="56" width="32" height="40" fill={kit.patternColour ?? t} />
          </>
        )}
        <path d="M22 30 L22 92" stroke="rgb(0 0 0 / .18)" strokeWidth="2" />
        <path d="M78 30 L78 92" stroke="rgb(0 0 0 / .18)" strokeWidth="2" />
      </g>
      <path d={body} fill="none" stroke="rgb(0 0 0 / .35)" strokeWidth="1" />
      {/* collar */}
      <path d="M36 22 C41 29 59 29 64 22" fill="none" stroke={t} strokeWidth="3.5" strokeLinecap="round" />
      {/* number */}
      {number ? (
        <text
          x="50"
          y="72"
          textAnchor="middle"
          fontSize="25"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
          fill={numberInk}
          stroke={numberStroke}
          strokeWidth={patterned ? 3.2 : 0.8}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {number}
        </text>
      ) : null}
    </svg>
  );
}
