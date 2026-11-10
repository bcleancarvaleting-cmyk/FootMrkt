import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Pure parts of the MATCHX value estimates (see src/server/value-estimates.ts). */
/** Formula estimates stop short of Gold: Gold needs a named estimate or a real value. */
export const FORMULA_CAP_GBP = 18_000_000;

const LEAGUE_BASE_GBP: Record<number, number> = { 1: 12_000_000, 2: 1_800_000, 3: 600_000, 4: 300_000, 5: 80_000 };

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ø/gi, "o").replace(/ı/g, "i").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function hash01(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

export function formulaValue(p: { id: string; squadNumber: number | null; leagueTier: number; clubStrength: number; leagueAvgStrength: number }) {
  const base = LEAGUE_BASE_GBP[Math.min(5, Math.max(1, p.leagueTier))];
  const strength = 1.06 ** (p.clubStrength - p.leagueAvgStrength);
  const n = p.squadNumber;
  const role = n !== null && n >= 1 && n <= 11 ? 1.4 : n !== null && n <= 25 ? 1 : n !== null && n <= 40 ? 0.55 : 0.3;
  const spread = 0.75 + hash01(p.id) * 0.55;
  const v = Math.min(FORMULA_CAP_GBP, base * strength * role * spread);
  return Math.max(10_000, v >= 1_000_000 ? Math.round(v / 100_000) * 100_000 : Math.round(v / 5_000) * 5_000);
}

export function loadNamedEstimates(file = join(process.cwd(), "prisma", "data", "value-estimates.txt")) {
  const out = new Map<string, number>();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [club, name, m] = line.split("|").map((x) => x.trim());
    out.set(`${club}|${norm(name)}`, Math.round(Number(m) * 1_000_000));
  }
  return out;
}

