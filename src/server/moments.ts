import { db } from "./db";

/**
 * Moments: the big things worth a full-screen celebration — winning a match, a podium, a new
 * personal best, a captain hat-trick, levelling up, an achievement. Each is shown once, the next
 * time the manager opens MATCHX (and recent ones only: nobody gets last month's confetti).
 */
export async function addMoment(userId: string, m: { kind: string; icon: string; title: string; subtitle: string; href?: string; cta?: string; key: string }) {
  await db.moment.createMany({ data: [{ userId, ...m }], skipDuplicates: true });
}

export async function nextMoment(userId: string, now = new Date()) {
  return db.moment.findFirst({
    where: { userId, shownAt: null, createdAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } },
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, icon: true, title: true, subtitle: true, href: true, cta: true },
  });
}

export async function markMomentShown(userId: string, id: string) {
  await db.moment.updateMany({ where: { id, userId, shownAt: null }, data: { shownAt: new Date() } });
}
