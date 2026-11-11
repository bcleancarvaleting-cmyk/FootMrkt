/**
 * Development and first-start seed — the 92 (Premier League to League Two), 2026-27 season.
 *
 * Squads come from Sportmonks when its token is available and DATA_PROVIDER=sportmonks (with real
 * history so far this season); otherwise from prisma/data/football-2026-27.json (Wikipedia,
 * CC BY-SA 4.0) with simulated history. Skips itself if the database is already set up.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/server/db";
import { type WorldData, seedWorld } from "../src/server/seed-world";

async function main() {
  if (await db.sport.findUnique({ where: { code: "football" } })) {
    console.log("Database already seeded — truncate it (or run `npm run db:reset`) for a fresh start.");
    return;
  }
  if (process.env.DATA_PROVIDER === "sportmonks") {
    const { buildSportmonksData } = await import("../src/server/sportmonks-data");
    const data = await buildSportmonksData((m: string) => console.log(m));
    await seedWorld(data, { realHistory: true });
    return;
  }
  const data = JSON.parse(readFileSync(join(__dirname, "data", "football-2026-27.json"), "utf8")) as WorldData;
  await seedWorld(data);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
