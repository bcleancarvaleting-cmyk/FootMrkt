import { z } from "zod";

/**
 * Manager club crests. A crest is a small design record (no images): a shape, a pattern in two
 * colours, an emblem, the club's initials and an optional "est." year. Rendered as SVG by
 * <ClubCrest>, so it looks sharp everywhere and costs nothing to store.
 */

export const CREST_SHAPES = ["shield", "pointed", "round", "hexagon", "square"] as const;
export const CREST_PATTERNS = ["plain", "stripes", "hoops", "halves", "quarters", "sash", "chevron"] as const;
export const CREST_EMBLEMS = ["none", "star", "crown", "ball", "bolt", "tower", "flame", "tree"] as const;

/** Football-kit colours managers can pick from. */
export const CREST_COLOURS = [
  "#C8102E", // red
  "#7A263A", // claret
  "#E35205", // orange
  "#FDB913", // amber
  "#F2CF63", // gold
  "#ADFC07", // MATCHX lime
  "#00843D", // green
  "#0E7C86", // teal
  "#6CABDD", // sky blue
  "#034694", // royal blue
  "#132257", // navy
  "#5B2C83", // purple
  "#111111", // black
  "#FFFFFF", // white
] as const;

export const CrestSchema = z.object({
  shape: z.enum(CREST_SHAPES),
  pattern: z.enum(CREST_PATTERNS),
  emblem: z.enum(CREST_EMBLEMS),
  primary: z.enum(CREST_COLOURS),
  secondary: z.enum(CREST_COLOURS),
  accent: z.enum(CREST_COLOURS),
  initials: z
    .string()
    .trim()
    .max(3)
    .regex(/^[A-Za-z0-9&]*$/, "Initials: letters and numbers only")
    .transform((s) => s.toUpperCase()),
  est: z.boolean().default(true),
  /** The MATCHX house account (admins): shown as the MATCHX X instead of a designed crest. */
  house: z.boolean().optional(),
});

/** The crest every admin account plays under — the MATCHX X. */
export const HOUSE_CREST = { shape: "round", pattern: "plain", emblem: "none", primary: "#111111", secondary: "#ADFC07", accent: "#ADFC07", initials: "MX", est: false, house: true } as const;
export type Crest = z.output<typeof CrestSchema>;

export const ClubNameSchema = z
  .string()
  .trim()
  .min(3, "Club name must be 3–30 characters")
  .max(30, "Club name must be 3–30 characters")
  .regex(/^[A-Za-z0-9 .&'-]+$/, "Club name: letters, numbers, spaces and . & ' - only");

/** "Hackney Wanderers FC" → "HW"; single words give their first two letters. */
export function initialsFor(name: string) {
  const words = name
    .split(/[\s.-]+/)
    .filter((w) => w && !/^(FC|AFC|CF|SC)$/i.test(w));
  if (!words.length) return "MX";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Contrasting colour pairs that look good on a crest. */
const PAIRS: Array<[string, string, string]> = [
  ["#C8102E", "#FFFFFF", "#F2CF63"],
  ["#034694", "#FFFFFF", "#F2CF63"],
  ["#132257", "#6CABDD", "#FFFFFF"],
  ["#7A263A", "#6CABDD", "#F2CF63"],
  ["#111111", "#FFFFFF", "#ADFC07"],
  ["#00843D", "#FFFFFF", "#FDB913"],
  ["#FDB913", "#111111", "#FFFFFF"],
  ["#5B2C83", "#F2CF63", "#FFFFFF"],
  ["#E35205", "#111111", "#FFFFFF"],
  ["#6CABDD", "#132257", "#FFFFFF"],
  ["#0E7C86", "#FFFFFF", "#FDB913"],
  ["#FFFFFF", "#C8102E", "#111111"],
];

/**
 * A set of different starting designs for a club name — the manager picks one, then tweaks it.
 * Deterministic, so the same name always offers the same designs.
 */
export function suggestedCrests(clubName: string, count = 8): Crest[] {
  const initials = initialsFor(clubName || "MATCHX");
  const h = hash(clubName.toLowerCase() || "matchx");
  return Array.from({ length: count }, (_, i) => {
    const pair = PAIRS[(h + i * 5) % PAIRS.length];
    return {
      shape: CREST_SHAPES[(h + i) % CREST_SHAPES.length],
      pattern: CREST_PATTERNS[(h + i * 3) % CREST_PATTERNS.length],
      emblem: CREST_EMBLEMS[1 + ((h + i * 7) % (CREST_EMBLEMS.length - 1))],
      primary: pair[0] as Crest["primary"],
      secondary: pair[1] as Crest["secondary"],
      accent: pair[2] as Crest["accent"],
      initials,
      est: i % 2 === 0,
    };
  });
}

/** A stored crest, or null if missing/invalid (old data never breaks a page). */
export function toCrest(raw: unknown): Crest | null {
  const r = CrestSchema.safeParse(raw);
  return r.success ? r.data : null;
}
