import { db } from "./db";
import { sendPush } from "./push";

/** Add an in-app notification. A dedupe key stops the same alert being sent twice. */
export async function notify(userId: string, n: { kind: string; title: string; body: string; href?: string; dedupeKey?: string; data?: Record<string, unknown> }) {
  const r = await db.notification.createMany({ data: [{ userId, kind: n.kind, title: n.title, body: n.body, href: n.href, dedupeKey: n.dedupeKey, data: n.data as never }], skipDuplicates: true });
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

export type TransferNotice = { player: string; from: string; to: string; fee: string | null; type: string | null; date: string | null; cardId: string; playerId: string };

/** Transfer news the manager hasn't accepted yet (shown as a pop-up until they tap Accept). */
export async function pendingTransferNews(userId: string) {
  const rows = await db.notification.findMany({ where: { userId, kind: "TRANSFER", readAt: null, data: { not: undefined } }, orderBy: { createdAt: "asc" }, take: 5 });
  return rows.filter((r) => r.data).map((r) => ({ id: r.id, ...(r.data as TransferNotice) }));
}

export async function acceptNotification(userId: string, id: string) {
  await db.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
}
