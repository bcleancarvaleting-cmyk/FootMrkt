/**
 * Parse market values pasted from a web table or spreadsheet (e.g. a filtered market-value list
 * copied from a browser) or a CSV. Pure — matching against the player database happens elsewhere.
 *
 * Each line needs a player name and a value such as "£45.00m", "€8.50m", "£850k" or "£1.2bn".
 * Euro values are converted with EUR_TO_GBP (set it to the rate you want to use).
 */
export const EUR_TO_GBP = 0.85;

const VALUE = /([£€])\s?(\d+(?:[.,]\d+)?)\s*(bn|m|k|th\.?|mil|million)?/i;

export function parseValueGbp(text: string, eurToGbp = EUR_TO_GBP): number | null {
  const m = text.match(VALUE);
  if (!m) return null;
  const n = Number(m[2].replace(",", "."));
  const unit = (m[3] ?? "").toLowerCase();
  const mult = unit === "bn" ? 1e9 : unit === "m" || unit === "mil" || unit === "million" ? 1e6 : unit.startsWith("k") || unit.startsWith("th") ? 1e3 : 1;
  const value = n * mult * (m[1] === "€" ? eurToGbp : 1);
  return Number.isFinite(value) ? Math.round(value) : null;
}

const TRANSLIT: Record<string, string> = { ø: "o", Ø: "O", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", ß: "ss", đ: "d", Đ: "D", ł: "l", Ł: "L", ı: "i", þ: "th", ð: "d" };

export const normName = (s: string) =>
  s
    .replace(/[øØæÆœŒßđĐłŁıþð]/g, (c) => TRANSLIT[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export interface NamedPlayer {
  id: string;
  fullName: string;
  clubName: string | null;
}

export interface ParsedValue {
  line: number;
  text: string;
  valueGbp: number;
  playerId: string;
}

export interface ParseResult {
  matched: ParsedValue[];
  unmatched: Array<{ line: number; text: string; reason: string }>;
}

/**
 * Find, per line, the longest known player name it contains and the first value. Where a name is
 * shared by several players, the club name on the line decides; if it can't, the line is skipped.
 */
export function matchPastedValues(text: string, players: NamedPlayer[], eurToGbp = EUR_TO_GBP): ParseResult {
  const byName = new Map<string, NamedPlayer[]>();
  for (const p of players) {
    const k = normName(p.fullName);
    if (k.length < 4) continue;
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const out: ParseResult = { matched: [], unmatched: [] };
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const value = parseValueGbp(line, eurToGbp);
    if (value === null) {
      if (/[a-z]{3,}/i.test(line) && line.length > 6) out.unmatched.push({ line: i + 1, text: line, reason: "no value found" });
      return;
    }
    const norm = ` ${normName(line)} `;
    const name = names.find((n) => norm.includes(` ${n} `));
    if (!name) return void out.unmatched.push({ line: i + 1, text: line, reason: "player not found" });
    let candidates = byName.get(name)!;
    if (candidates.length > 1) candidates = candidates.filter((p) => p.clubName && norm.includes(` ${normName(p.clubName)} `));
    if (candidates.length !== 1) return void out.unmatched.push({ line: i + 1, text: line, reason: "more than one player with this name" });
    if (seen.has(candidates[0].id)) return;
    seen.add(candidates[0].id);
    out.matched.push({ line: i + 1, text: line, valueGbp: value, playerId: candidates[0].id });
  });
  return out;
}
