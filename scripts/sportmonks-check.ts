/**
 * Prove the Sportmonks connection against real data before switching it on. Read-only.
 * The same check runs from Admin → Integrations → "Test connection".
 *
 *   npm run sportmonks:check
 */
import "dotenv/config";
import { runSportmonksCheck } from "../src/server/sportmonks-check";

const MARK = { ok: "  ✓", warn: "  !", fail: "  ✗", head: "\n", info: "    " } as const;
runSportmonksCheck()
  .then(({ passed, lines }) => {
    for (const l of lines) console.log(`${MARK[l.level]} ${l.text}`);
    console.log(`\nResult: ${passed ? "all checks passed" : "problems found"}.`);
    process.exitCode = passed ? 0 : 1;
  })
  .finally(async () => (await import("../src/server/db")).db.$disconnect());
