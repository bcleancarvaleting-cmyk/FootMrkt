import webpush from "web-push";
import { db } from "./db";

/**
 * Web push to installed apps and browsers. Needs VAPID keys (generate once with
 * `npx web-push generate-vapid-keys`) in VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, plus VAPID_SUBJECT
 * (mailto: or https: contact). Without them, push is simply off and in-app notifications still work.
 */
export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;
const configured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
let ready = false;
function setup() {
  if (ready || !configured()) return configured();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@playmatchx.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  ready = true;
  return true;
}

export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}

export const removeSubscription = (endpoint: string) => db.pushSubscription.deleteMany({ where: { endpoint } });

/** Send to every device a manager has push on. Dead subscriptions are removed. Never throws. */
export async function sendPush(userId: string, msg: { title: string; body: string; url?: string }, send = webpush.sendNotification) {
  if (!setup()) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  for (const s of subs) {
    try {
      await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? "/" }), { TTL: 6 * 3600 });
      await db.pushSubscription.update({ where: { id: s.id }, data: { lastOkAt: new Date() } });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // 404/410: the browser unsubscribed or the app was removed.
      if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      else console.error("push failed", code, (e as Error).message);
    }
  }
  return sent;
}
