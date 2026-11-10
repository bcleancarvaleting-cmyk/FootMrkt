/**
 * Load MATCHX estimated market values for every player and re-tier cards (no listings are created).
 *   npm run values:estimate [-- --dry-run]
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { estimateAllValues } from "../src/server/value-estimates";

estimateAllValues(null, { dryRun: process.argv.includes("--dry-run") })
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .finally(() => db.$disconnect());
