import { db } from "./db";
import { sendPush } from "./push";

/**
 * "New fixture added" (product request 16 Nov 2026): when new games open, everyone is told — in the
 * app and on their phone if they turned notifications on. It waits until an hour has passed since the
 * newest one was added, so a batch of games goes out as one "New fixtures added" message.
 */
export const ANNOUNCE_DELAY_MS = 60 * 60_000;
const KEY = "games.announcedUpTo";

export async function announceNewGames(now = new Date()) {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  if (!row) {
    // First run: start from now, so games that already existed aren't announced.
    await db.appSetting.create({ data: { key: KEY, value: now.getTime() } });
    return { skipped: "first run" };
  }
  const since = new Date(Number(row.value));
  const fresh = await db.competition.findMany({
    where: { createdAt: { gt: since }, status: { in: ["OPEN", "UPCOMING"] }, locksAt: { gt: now } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, createdAt: true },
  });
  if (!fresh.length) return { sent: 0 };
  const newest = fresh[fresh.length - 1].createdAt;
  if (now.getTime() - newest.getTime() < ANNOUNCE_DELAY_MS) return { waiting: fresh.length };

  const one = fresh.length === 1;
  const title = one ? "⚽ New fixture added" : "⚽ New fixtures added";
  const names = fresh.slice(0, 3).map((c) => c.name).join(", ");
  const body = one ? `${fresh[0].name} is open — pick your team.` : `${fresh.length} new games are open: ${names}${fresh.length > 3 ? "…" : ""}. Pick your teams.`;
  const href = one ? `/competitions/${fresh[0].id}` : "/matches";
  const dedupeKey = `new-games:${newest.getTime()}`;

  const users = await db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  for (let i = 0; i < users.length; i += 500) {
    await db.notification.createMany({ data: users.slice(i, i + 500).map((u) => ({ userId: u.id, kind: "NEW_GAMES", title, body, href, dedupeKey: `${dedupeKey}:${u.id}` })), skipDuplicates: true });
  }
  const phones = await db.pushSubscription.findMany({ distinct: ["userId"], select: { userId: true } });
  for (const p of phones) await sendPush(p.userId, { title, body, url: href }).catch(() => {});
  await db.appSetting.update({ where: { key: KEY }, data: { value: newest.getTime() } });
  return { sent: users.length, games: fresh.length };
}
