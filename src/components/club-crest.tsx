import type { Crest } from "@/lib/crest";

/** Outline of each crest shape, in a 100 × 120 box. */
const SHAPES: Record<Crest["shape"], string> = {
  shield: "M10 8 H90 V58 C90 86 72 102 50 114 C28 102 10 86 10 58 Z",
  pointed: "M10 12 L50 4 L90 12 V60 C90 84 74 100 50 116 C26 100 10 84 10 60 Z",
  round: "M50 10 A50 50 0 1 1 49.99 10 Z M50 10",
  hexagon: "M50 4 L94 28 V88 L50 114 L6 88 V28 Z",
  square: "M26 10 H74 A18 18 0 0 1 92 28 V92 A18 18 0 0 1 74 110 H26 A18 18 0 0 1 8 92 V28 A18 18 0 0 1 26 10 Z",
};
// The round crest sits lower so it lines up with the others.
const ROUND = { cx: 50, cy: 62, r: 46 };

/** Emblems drawn in a 24 × 24 box. */
const EMBLEMS: Record<Exclude<Crest["emblem"], "none">, string> = {
  star: "M12 1.8l3 6.7 7.3.7-5.5 4.9 1.6 7.2L12 17.6 5.6 21.3l1.6-7.2L1.7 9.2 9 8.5z",
  crown: "M3 18.5h18V21H3zM2.5 6.5 7.5 11 12 3.5l4.5 7.5 5-4.5-2 10.5h-15z",
  bolt: "M13.5 1.5 4 14h6.5l-1.5 8.5 10.5-13H13z",
  ball: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4.2 3.6 2.6-1.4 4.2H9.8L8.4 8.8zM5.1 9.6l1.8.6 1.4 4.3-1.1 1.6-2.3-.1A8 8 0 0 1 4 12a8 8 0 0 1 1.1-2.4zm13.8 0A8 8 0 0 1 20 12a8 8 0 0 1-.9 4l-2.3.1-1.1-1.6 1.4-4.3zM10.3 16.5h3.4l1.1 1.6-.8 1.8a8 8 0 0 1-4 0l-.8-1.8z",
  tower: "M4 22V9h3V5.5h2.5V9h1.5V5.5h2V9h1.5V5.5H17V9h3v13h-6v-5.5a2 2 0 0 0-4 0V22z",
  flame: "M12 1.5c1.2 4.2 6.5 6.6 6.5 12.5a6.5 6.5 0 0 1-13 0c0-3.2 1.9-5.4 3.1-7.2.2 2.1 1.2 3.4 2.4 3.6-.3-3.2-.4-5.6 1-8.9z",
  tree: "M12 1.5 4.5 12h4L4 18.5h7v4h2v-4h7L15.5 12h4z",
};

function Pattern({ crest }: { crest: Crest }) {
  const c = crest.secondary;
  switch (crest.pattern) {
    case "stripes":
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={14 + i * 22} y="0" width="11" height="120" fill={c} />
          ))}
        </>
      );
    case "hoops":
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x="0" y={18 + i * 26} width="100" height="12" fill={c} />
          ))}
        </>
      );
    case "halves":
      return <rect x="50" y="0" width="50" height="120" fill={c} />;
    case "quarters":
      return (
        <>
          <rect x="50" y="0" width="50" height="60" fill={c} />
          <rect x="0" y="60" width="50" height="60" fill={c} />
        </>
      );
    case "sash":
      return <path d="M-10 20 L20 -10 L110 80 L80 110 Z" fill={c} />;
    case "chevron":
      return <path d="M0 40 L50 70 L100 40 V62 L50 92 L0 62 Z" fill={c} />;
    default:
      return null;
  }
}

/**
 * A manager's club crest. Pure SVG, so it works in server and client components and at any size.
 * `id` must be unique on the page (it names the clip path).
 */
export function ClubCrest({ crest, id, size = 40, title, className = "" }: { crest: Crest; id: string; size?: number; title?: string; className?: string }) {
  // The MATCHX house account (admins): the X logo.
  if (crest.house) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/icons/icon-192.png" alt={title ?? "MATCHX"} width={size} height={size} className={`rounded-[22%] ring-1 ring-[#adfc07]/40 ${className}`} />;
  }
  const clip = `crest-${id}`;
  const outline =
    crest.shape === "round" ? <circle cx={ROUND.cx} cy={ROUND.cy} r={ROUND.r} /> : <path d={SHAPES[crest.shape]} />;
  const hasEmblem = crest.emblem !== "none";
  const initialsY = hasEmblem ? 92 : 72;
  const initialsSize = hasEmblem ? (crest.initials.length > 2 ? 15 : 18) : crest.initials.length > 2 ? 26 : 32;
  // The band behind the initials keeps them readable over any pattern.
  return (
    <svg viewBox="0 0 100 120" width={size} height={(size * 120) / 100} role="img" aria-label={title ?? "Club crest"} className={className}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={clip}>{outline}</clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="120" fill={crest.primary} />
        <Pattern crest={crest} />
        {crest.initials && <rect x="0" y={initialsY - initialsSize * 0.95} width="100" height={initialsSize * 1.3} fill={crest.primary} opacity="0.92" />}
      </g>
      {/* Outer rim and inner keyline. */}
      {crest.shape === "round" ? (
        <>
          <circle cx={ROUND.cx} cy={ROUND.cy} r={ROUND.r} fill="none" stroke={crest.accent} strokeWidth="5" />
          <circle cx={ROUND.cx} cy={ROUND.cy} r={ROUND.r - 6} fill="none" stroke={crest.secondary} strokeWidth="1.5" opacity="0.8" />
        </>
      ) : (
        <path d={SHAPES[crest.shape]} fill="none" stroke={crest.accent} strokeWidth="5" strokeLinejoin="round" />
      )}
      {hasEmblem && (
        <g transform={`translate(${50 - 17} ${crest.initials ? 26 : 38}) scale(${34 / 24})`}>
          <path d={EMBLEMS[crest.emblem as Exclude<Crest["emblem"], "none">]} fill={crest.accent} stroke={crest.primary} strokeWidth="0.8" strokeLinejoin="round" fillRule="evenodd" />
        </g>
      )}
      {crest.initials && (
        <text
          x="50"
          y={initialsY}
          textAnchor="middle"
          fill={crest.accent}
          style={{ font: `800 ${initialsSize}px var(--font-display-face), 'Arial Narrow', sans-serif`, letterSpacing: "0.04em" }}
        >
          {crest.initials}
        </text>
      )}
      {crest.est && (
        <text x="50" y={crest.shape === "round" ? 22 : 20} textAnchor="middle" fill={crest.accent} style={{ font: "700 7px var(--font-geist-sans), sans-serif", letterSpacing: "0.18em" }}>
          EST. 2026
        </text>
      )}
    </svg>
  );
}

/** The crest if the manager has one; otherwise their initial in a circle (old behaviour). */
export function ManagerBadge({ crest, name, id, size = 36 }: { crest: Crest | null; name: string; id: string; size?: number }) {
  if (crest) return <ClubCrest crest={crest} id={id} size={size * 0.85} title={`${name} club crest`} />;
  return (
    <span className="flex items-center justify-center rounded-full bg-ink-800 font-display font-extrabold uppercase text-fg ring-1 ring-ink-600" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {name.slice(0, 1)}
    </span>
  );
}
