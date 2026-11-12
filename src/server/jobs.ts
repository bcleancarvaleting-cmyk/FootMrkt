import { db } from "./db";
import { runScheduledJobs } from "./gameweeks";
import { reportError } from "./monitoring";
import { weeklyRhythm } from "./rhythm";
import { settleH2H } from "./h2h";
import { executeDueReleases } from "./supply";
import { expireListings, settleAuctions } from "./transfers";
import { grantAllDueWelcomePacks } from "./welcome";

/**
 * The every-5-minutes job: open/lock gameweeks, live scores, card releases, expired listings,
 * auctions and welcome packs. Each step runs even if an earlier one fails; failures are alerted.
 */
export async function tick() {
  // Never run alongside a rebuild: the data is being replaced underneath.
  const { rebuildStatus } = await import("./rebuild");
  if ((await rebuildStatus()).state === "running") return { skipped: "rebuild running" };
  const steps: Array<[string, () => Promise<unknown>]> = [
    ["gameweeks & live data", runScheduledJobs],
    ["top recruiters' prizes", async () => (await import("./referrals")).payRecruiterPrizes()],
    ["daily player drops", async () => (await import("./player-drops")).runDailyDrops()],
    ["standard matches", async () => (await import("./gameweeks")).ensureStandardMatches()],
    ["card releases", executeDueReleases],
    ["expired listings", expireListings],
    ["auctions", settleAuctions],
    ["welcome packs", grantAllDueWelcomePacks],
    ["weekly reminders & results", weeklyRhythm],
    ["head-to-head", settleH2H],
    ["goal alerts", async () => (await import("./live")).alertGoals()],
    ["man of the match", async () => (await import("./live")).awardMotm()],
    ["price tips", async () => (await import("./valuation")).refreshPriceTips()],
    ["watchlist: players on the market", async () => (await import("./watchlist")).announceWatchedMarket()],
    ["watchlist value alerts", async () => (await import("./watchlist")).alertValueMoves()],
    ["waitlist launch emails", async () => (await import("./waitlist")).sendLaunchEmails()],
    ["app messages & giveaways", async () => (await import("./app-messages")).appMessages()],
    ["team of the week", async () => (await import("./totw")).pickTeamOfTheWeek()],
    ["friday digest", async () => (await import("./digest")).sendWeeklyDigests()],
    ["mini-league winners", async () => (await import("./alerts")).announceLeagueWinners()],
    ["gift drop alerts", async () => (await import("./alerts")).announceGiftDrops()],
    ["weekly boosters", async () => ({ granted: await (await import("./boosters")).grantWeeklyBoosters(), reminded: await (await import("./boosters")).remindExpiringBoosters() })],
    ["squads & transfers (daily)", async () => (await import("./live-data")).dailySquadSync()],
    ["expired logins", async () => (await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })).count],
  ];
  const out: Record<string, unknown> = {};
  for (const [name, run] of steps) {
    try {
      out[name] = await run();
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : String(e) };
      await reportError(`Scheduled job failed: ${name}`, e);
    }
  }
  await db.appSetting.upsert({ where: { key: "jobs.lastTickAt" }, create: { key: "jobs.lastTickAt", value: Date.now() }, update: { value: Date.now() } }).catch(() => {});
  return out;
}

/** When the scheduled job last ran (for the health check). */
export async function lastTickAt() {
  const row = await db.appSetting.findUnique({ where: { key: "jobs.lastTickAt" } }).catch(() => null);
  return row ? new Date(Number(row.value)) : null;
}
