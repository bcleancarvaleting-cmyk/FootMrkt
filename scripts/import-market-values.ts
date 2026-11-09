/**
 * Import player market values and re-tier cards (Gold / Silver / Bronze).
 *
 *   npm run values:import -- values.csv [--dry-run]
 *
 * CSV columns (header row required):
 *   club_code,player_name,market_value_gbp,source,as_of
 *   ARS,Bukayo Saka,120000000,<licensed source>,2026-11-01
 *
 * Use a source you're licensed to use commercially. Thresholds live in src/config/tiers.ts.
 * Already-issued cards keep their tier; future releases and packs use the new tier.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { tierForValue } from "../src/config/tiers";
import { db } from "../src/server/db";
import { applyMarketValues } from "../src/server/tiering";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function main() {
  const file = process.argv[2];
  const dry = process.argv.includes("--dry-run");
  if (!file) throw new Error("Usage: npm run values:import -- values.csv [--dry-run]");
  const [header, ...lines] = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim());
  const keys = header.split(",").map((k) => k.trim().toLowerCase());
  const players = await db.player.findMany({ include: { club: true } });
  const index = new Map(players.map((p) => [`${p.club?.code}|${norm(`${p.firstName} ${p.lastName}`)}`, p]));
  const rows = [];
  const problems: string[] = [];
  const counts = { GOLD: 0, SILVER: 0, BRONZE: 0 };
  for (const [i, line] of lines.entries()) {
    const r = Object.fromEntries(line.split(",").map((v, k) => [keys[k], v.trim()]));
    const p = index.get(`${(r.club_code ?? "").toUpperCase()}|${norm(r.player_name ?? "")}`);
    const pounds = Number(String(r.market_value_gbp).replace(/[£,\s]/g, ""));
    if (!p) { problems.push(`line ${i + 2}: no player "${r.player_name}" at ${r.club_code}`); continue; }
    if (!Number.isFinite(pounds) || pounds < 0) { problems.push(`line ${i + 2}: bad market_value_gbp`); continue; }
    const valueGbp = Math.round(pounds);
    counts[tierForValue(valueGbp)]++;
    rows.push({ playerId: p.id, valueGbp, source: r.source || "unspecified", at: r.as_of ? new Date(r.as_of) : new Date() });
  }
  console.log(`${rows.length} matched → Gold ${counts.GOLD}, Silver ${counts.SILVER}, Bronze ${counts.BRONZE}`);
  problems.forEach((p) => console.log("  ", p));
  if (!dry) console.log(await applyMarketValues(rows));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
