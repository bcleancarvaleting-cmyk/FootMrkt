/**
 * Background job runner (spec §13). Run on a schedule (cron / worker), e.g. every 5 minutes:
 *   npm run jobs -- tick
 * Other commands are for operators:
 *   npm run jobs -- revalue | release | expire | reconcile
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { runScheduledJobs } from "../src/server/gameweeks";
import { expireListings, settleAuctions } from "../src/server/transfers";
import { executeDueReleases, supplyReport } from "../src/server/supply";
import { revalueAll } from "../src/server/valuation";

async function main(cmd = "tick") {
  switch (cmd) {
    case "tick": {
      console.log("windows", await runScheduledJobs());
      console.log("releases", await executeDueReleases());
      console.log("expired listings", await expireListings());
      console.log("auctions settled", await settleAuctions());
      break;
    }
    case "revalue":
      console.log(await revalueAll());
      break;
    case "release":
      console.log(await executeDueReleases());
      break;
    case "expire":
      console.log(await expireListings());
      break;
    case "reconcile": {
      const r = await supplyReport();
      console.log(r);
      if (!r.reconciled) process.exitCode = 2;
      break;
    }
    default:
      console.error(`Unknown command ${cmd}`);
      process.exitCode = 1;
  }
}

main(process.argv[2])
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
