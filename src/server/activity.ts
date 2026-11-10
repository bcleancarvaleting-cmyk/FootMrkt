import { resolvePredictions } from "./predictions";
import { refreshProgress } from "./progression";
import { touchStreak } from "./streaks";

/**
 * Background housekeeping after a logged-in page view (run with next/server `after`, so it never
 * slows the page): the daily streak, achievements/level rewards (at most once a minute per manager)
 * and settling finished daily predictions (at most every 5 minutes overall).
 */
const lastProgress = new Map<string, number>();
let lastResolve = 0;

export async function onVisit(userId: string) {
  try {
    await touchStreak(userId);
    const now = Date.now();
    if (now - lastResolve > 5 * 60_000) {
      lastResolve = now;
      await resolvePredictions();
    }
    if (now - (lastProgress.get(userId) ?? 0) > 60_000) {
      lastProgress.set(userId, now);
      await refreshProgress(userId);
    }
  } catch (e) {
    console.error("onVisit", e);
  }
}
