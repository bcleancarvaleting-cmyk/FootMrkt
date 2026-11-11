/**
 * Write prisma/data/football-2026-27.json from Sportmonks (the 92 and their current squads), so a
 * fresh `npm run db:reset` builds the game from it. Most sites don't need this: Admin →
 * Integrations → "Rebuild from Sportmonks" does it in place.
 *
 *   npm run sportmonks:import
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import "../src/server/integrations";
import { buildSportmonksData } from "../src/server/sportmonks-data";

buildSportmonksData((m) => console.log(m))
  .then((data) => {
    const file = join(__dirname, "..", "prisma", "data", "football-2026-27.json");
    writeFileSync(file, JSON.stringify(data, null, 1));
    console.log(`Wrote ${file}`);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => (await import("../src/server/db")).db.$disconnect());
