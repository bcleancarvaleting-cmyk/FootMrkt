import { db } from "./db";

const WEEK = 7 * 86_400_000;

/** Start of the ISO-ish week (Monday 00:00 UTC) for each of the last `n` weeks, oldest first. */
function weekStarts(n: number, now = new Date()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return Array.from({ length: n }, (_, i) => new Date(d.getTime() - (n - 1 - i) * WEEK));
}
const label = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export async function dashboard(now = new Date()) {
  const weeks = weekStarts(12, now);
  const from = weeks[0];
  const day = new Date(now.getTime() - 86_400_000);
  const week = new Date(now.getTime() - WEEK);
  const [users, newToday, newWeek, installs, notif, orders, signups, ownerships, startingHeld, supporters, active7] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: day } } }),
    db.user.count({ where: { createdAt: { gte: week } } }),
    db.user.count({ where: { appInstalledAt: { not: null } } }),
    db.user.count({ where: { notificationsEnabled: true } }),
    db.order.findMany({ where: { status: "PAID", kind: { in: ["PACK_PURCHASE", "DEPOSIT"] }, createdAt: { gte: from } }, select: { amountMinor: true, createdAt: true } }),
    db.user.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } }),
    db.cardOwnership.findMany({
      where: { OR: [{ acquiredAt: { gte: from } }, { releasedAt: { gte: from } }] },
      select: { acquiredAt: true, releasedAt: true },
    }),
    db.cardOwnership.count({ where: { acquiredAt: { lt: from }, OR: [{ releasedAt: null }, { releasedAt: { gte: from } }] } }),
    db.user.groupBy({ by: ["favouriteClubId"], _count: { _all: true }, where: { favouriteClubId: { not: null } } }),
    db.user.count({ where: { lastSeenAt: { gte: week } } }),
  ]);
  const bucket = (d: Date) => weeks.findLastIndex((w) => d >= w);
  const revenue = weeks.map(() => 0);
  for (const o of orders) revenue[bucket(o.createdAt)] += o.amountMinor;
  const joins = weeks.map(() => 0);
  for (const u of signups) joins[bucket(u.createdAt)]++;
  // Cards held by managers at the end of each week = held before the window ± changes since.
  const delta = weeks.map(() => 0);
  for (const o of ownerships) {
    if (o.acquiredAt >= from) delta[bucket(o.acquiredAt)]++;
    if (o.releasedAt && o.releasedAt >= from) delta[bucket(o.releasedAt)]--;
  }
  let running = startingHeld;
  const circulation = delta.map((d) => (running += d));
  const clubs = await db.club.findMany({ where: { id: { in: supporters.map((s) => s.favouriteClubId!) } }, select: { id: true, name: true, league: { select: { name: true } } } });
  const support = supporters
    .map((s) => ({ club: clubs.find((c) => c.id === s.favouriteClubId)!, count: s._count._all }))
    .filter((s) => s.club)
    .sort((a, b) => b.count - a.count);
  return {
    kpis: { users, newToday, newWeek, active7, installs, notif, revenueWeekMinor: revenue.at(-1) ?? 0, cardsHeld: circulation.at(-1) ?? startingHeld },
    revenue: weeks.map((w, i) => ({ label: label(w), value: revenue[i] / 100 })),
    signups: weeks.map((w, i) => ({ label: label(w), value: joins[i] })),
    circulation: weeks.map((w, i) => ({ label: label(w), value: circulation[i] })),
    support,
  };
}
