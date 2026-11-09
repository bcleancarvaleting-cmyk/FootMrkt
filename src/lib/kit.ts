/** Home-kit model shared by the shirt graphic and the lookalike club badge. */
export interface Kit {
  body: string;
  sleeves: string;
  shorts: string;
  socks: string;
  pattern: "plain" | "stripes" | "hoops" | "halves" | "quarters";
  patternColour: string | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function toKit(raw: unknown, primary: string, secondary: string): Kit {
  const k = (raw ?? {}) as Partial<Kit>;
  const pick = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
  const pattern = ["plain", "stripes", "hoops", "halves", "quarters"].includes(String(k.pattern)) ? (k.pattern as Kit["pattern"]) : "plain";
  const body = pick(k.body, primary);
  return {
    body,
    sleeves: pick(k.sleeves, body),
    shorts: pick(k.shorts, secondary),
    socks: pick(k.socks, secondary),
    pattern,
    patternColour: k.patternColour && HEX.test(k.patternColour) ? k.patternColour : null,
  };
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever reads better on `bg`. */
export function ink(bg: string) {
  return HEX.test(bg) && luminance(bg) > 0.45 ? "#111111" : "#FFFFFF";
}

/** A trim colour that differs from the shirt body. */
export function trim(kit: Kit) {
  if (kit.patternColour && kit.patternColour !== kit.body) return kit.patternColour;
  if (kit.sleeves !== kit.body) return kit.sleeves;
  if (kit.shorts !== kit.body) return kit.shorts;
  return ink(kit.body);
}

/** Stable small hash for picking a badge style per club. */
export function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return h;
}
