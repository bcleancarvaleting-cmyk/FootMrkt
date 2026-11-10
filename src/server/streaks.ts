import { db, withTx } from "./db";
import { notify } from "./notifications";
import { grantPack } from "./packs";
import { creditXp } from "./wallet";

/** UK calendar day, e.g. "2026-11-10". */
export function ukDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Free pack for every 7th day in a row. */
export const STREAK_PACK = "football-bronze-pick";
export const streakXp = (streak: number) => 5 * Math.min(streak, 7);

/**
 * Daily login streak: the first visit each UK day extends the streak (or restarts it after a missed
 * day) and pays a little XP; every 7th day in a row adds a free Choice of Bronze. Idempotent per day.
 */
export async function touchStreak(userId: string, now = new Date()) {
  const today = ukDay(now);
  const yesterday = ukDay(new Date(now.getTime() - 86_400_000));
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { loginStreak: true, bestStreak: true, lastActiveDay: true } });
  if (u.lastActiveDay === today) return { streak: u.loginStreak, extended: false };
  const streak = u.lastActiveDay === yesterday ? u.loginStreak + 1 : 1;
  // Only one request per day wins this update, so the reward can't be paid twice.
  const won = await db.user.updateMany({
    where: { id: userId, OR: [{ lastActiveDay: null }, { lastActiveDay: { not: today } }] },
    data: { loginStreak: streak, bestStreak: Math.max(u.bestStreak, streak), lastActiveDay: today },
  });
  if (!won.count) return { streak: u.loginStreak, extended: false };
  const ref = `streak:${userId}:${today}`;
  await withTx(async (tx) => {
    await creditXp(tx, { userId, xp: streakXp(streak), refId: ref, note: `Day ${streak} streak` });
    if (streak % 7 === 0) await grantPack(tx, { userId, skuCode: STREAK_PACK, source: "REWARD", sourceRef: ref });
  });
  if (streak % 7 === 0) await notify(userId, { kind: "streak", title: `${streak}-day streak!`, body: "A free Choice of Bronze is waiting in Packs.", href: "/packs", dedupeKey: ref });
  return { streak, extended: true };
}
