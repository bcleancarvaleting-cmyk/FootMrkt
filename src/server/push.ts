import webpush from "web-push";
import { db } from "./db";

/**
 * Web push to installed apps and browsers. Needs VAPID keys (generate once with
 * `npx web-push generate-vapid-keys`) in VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, plus VAPID_SUBJECT
 * (mailto: or https: contact). Without them, push is simply off and in-app notifications still work.
 */
// Keys come from the environment, or are generated once and stored (private key encrypted) so
// push works with no setup. Changing keys means phones must re-subscribe, so they're never rotated.
let keys: { publicKey: string; privateKey: string } | null = null;
async function vapidKeys() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return (keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  const { readSecret, saveSecret } = await import("./secrets");
  const pub = await db.appSetting.findUnique({ where: { key: "push.vapid.public" } }).catch(() => null);
  const priv = await readSecret("vapid.private").catch(() => null);
  if (typeof pub?.value === "string" && priv) return (keys = { publicKey: pub.value, privateKey: priv });
  const made = webpush.generateVAPIDKeys();
  // Only the first writer wins, so two servers starting together agree on one pair.
  const created = await db.appSetting.create({ data: { key: "push.vapid.public", value: made.publicKey } }).catch(() => null);
  if (!created) {
    keys = null;
    const again = await db.appSetting.findUnique({ where: { key: "push.vapid.public" } });
    const p2 = await readSecret("vapid.private");
    if (typeof again?.value === "string" && p2) return (keys = { publicKey: again.value, privateKey: p2 });
    return null;
  }
  await saveSecret("vapid.private", made.privateKey, null);
  return (keys = made);
}

export async function pushPublicKey() {
  return (await vapidKeys().catch(() => null))?.publicKey ?? null;
}

let ready = false;
async function setup() {
  if (ready) return true;
  const k = await vapidKeys().catch(() => null);
  if (!k) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@playmatchx.com", k.publicKey, k.privateKey);
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
  if (!(await setup())) return 0;
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
