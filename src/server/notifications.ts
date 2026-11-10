import { db } from "./db";
import { sendPush } from "./push";

/** Add an in-app notification. A dedupe key stops the same alert being sent twice. */
export async function notify(userId: string, n: { kind: string; title: string; body: string; href?: string; dedupeKey?: string }) {
  const r = await db.notification.createMany({ data: [{ userId, kind: n.kind, title: n.title, body: n.body, href: n.href, dedupeKey: n.dedupeKey }], skipDuplicates: true });
  // Also to their phone, if they turned push on (only for new notifications, never repeats).
  if (r.count) await sendPush(userId, { title: n.title, body: n.body, url: n.href }).catch(() => {});
}

export async function myNotifications(userId: string, take = 40) {
  return db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
