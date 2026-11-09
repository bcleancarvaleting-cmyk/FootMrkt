/**
 * Attach LICENSED player headshots to cards.
 *
 *   npm run images:import -- path/to/images.csv [--dry-run]
 *
 * CSV columns (header row required):
 *   club_code,player_name,image_url,credit
 *   ARS,Bukayo Saka,https://cdn.example.com/players/saka.png,© Licensor 2026
 *
 * Only import images you hold rights to use commercially (spec §10). `credit` is stored with the
 * image and shown on hover. Matching is by club short code + player name (case/accent-insensitive).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { audit } from "../src/server/audit";
import { db } from "../src/server/db";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  const [header, ...body] = rows;
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!file) throw new Error("Usage: npm run images:import -- images.csv [--dry-run]");
  const rows = parseCsv(readFileSync(file, "utf8"));
  const players = await db.player.findMany({ include: { club: true } });
  const index = new Map(players.map((p) => [`${p.club?.code ?? ""}|${norm(`${p.firstName} ${p.lastName}`)}`, p]));
  let updated = 0;
  const problems: string[] = [];
  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    let url: URL;
    try {
      url = new URL(r.image_url);
    } catch {
      problems.push(`line ${line}: invalid image_url`);
      continue;
    }
    if (url.protocol !== "https:") {
      problems.push(`line ${line}: image_url must be https`);
      continue;
    }
    const p = index.get(`${r.club_code.toUpperCase()}|${norm(r.player_name)}`);
    if (!p) {
      problems.push(`line ${line}: no player "${r.player_name}" at ${r.club_code}`);
      continue;
    }
    if (!dryRun) {
      await db.player.update({ where: { id: p.id }, data: { imageUrl: url.toString(), imageCredit: r.credit || null } });
      await audit(db, { actorId: null, action: "player.image", entityType: "Player", entityId: p.id, before: { imageUrl: p.imageUrl }, after: { imageUrl: url.toString(), credit: r.credit } });
    }
    updated++;
  }
  console.log(`${dryRun ? "Would update" : "Updated"} ${updated} of ${rows.length} players`);
  for (const pr of problems) console.log("  ", pr);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
