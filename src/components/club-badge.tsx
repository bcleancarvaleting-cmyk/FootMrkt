import { type Kit, hash, ink, trim } from "@/lib/kit";

const SHAPES = {
  shield: "M20 1 L38 7 V22 C38 34 30 41 20 45 C10 41 2 34 2 22 V7 Z",
  heater: "M3 3 H37 V20 C37 33 29 40 20 45 C11 40 3 33 3 20 Z",
  round: "M20 2 A20 20 0 1 1 19.99 2 Z",
  banner: "M4 2 H36 V36 L20 44 L4 36 Z",
} as const;

/**
 * Club badge. A licensed crest when `crestUrl` is set; otherwise a lookalike badge in the club's
 * home colours and shirt pattern with its short code. Deliberately generic (no copied emblems),
 * so it reads as the club without reproducing its trademark.
 */
export function ClubBadge({
  short,
  primary,
  secondary,
  kit,
  crestUrl,
  size = 24,
  title,
}: {
  short: string | null;
  primary: string;
  secondary: string;
  kit?: Kit;
  crestUrl?: string | null;
  size?: number;
  title?: string;
}) {
  if (crestUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={crestUrl} alt={title ?? short ?? "Club crest"} width={size} height={size} className="object-contain" />;
  }
  const code = (short ?? "?").slice(0, 3);
  const shapeKey = (Object.keys(SHAPES) as Array<keyof typeof SHAPES>)[hash(code) % 4];
  const d = SHAPES[shapeKey];
  const base = kit?.body ?? primary;
  const accent = kit ? trim(kit) : secondary;
  const pattern = kit?.pattern ?? "plain";
  const id = `cb-${code}`;
  const textFill = pattern === "plain" ? ink(base) : ink(accent);
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46" role="img" aria-label={title ?? code}>
      <title>{title ?? code}</title>
      <defs>
        <clipPath id={id}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={d} fill={base} />
      <g clipPath={`url(#${id})`}>
        {pattern === "stripes" && [0, 1, 2, 3].map((i) => <rect key={i} x={4 + i * 9} y="0" width="4.5" height="46" fill={accent} />)}
        {pattern === "hoops" && [0, 1, 2].map((i) => <rect key={i} x="0" y={10 + i * 12} width="40" height="6" fill={accent} />)}
        {(pattern === "halves" || pattern === "quarters") && <rect x="20" y="0" width="20" height="46" fill={accent} />}
        {/* plaque behind the letters */}
        <rect x="5" y="17" width="30" height="14" rx="3" fill={pattern === "plain" ? "transparent" : accent} />
      </g>
      <path d={d} fill="none" stroke={accent} strokeWidth="2.5" />
      {shapeKey === "round" && <circle cx="20" cy="22" r="15" fill="none" stroke={accent} strokeWidth="1" opacity="0.7" />}
      <text x="20" y="28.5" textAnchor="middle" fontSize="11" fontWeight="900" fontFamily="system-ui, sans-serif" fill={textFill}>
        {code}
      </text>
    </svg>
  );
}
