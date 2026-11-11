import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { audit } from "./audit";
import { db } from "./db";

/**
 * API keys entered in Admin → Integrations, stored encrypted (AES-256-GCM) in the database. The
 * encryption key comes from SESSION_SECRET, so a database copy on its own doesn't reveal them.
 * Only the last 4 characters are ever shown back.
 */
type Stored = { iv: string; tag: string; data: string; last4: string; savedAt: string; savedBy: string | null };
const keyFor = () => createHash("sha256").update(`matchx-secrets:${process.env.SESSION_SECRET ?? "matchx-dev-session-secret"}`).digest();
const settingKey = (name: string) => `secret.${name}`;

export async function saveSecret(name: string, value: string, actorId: string | null) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFor(), iv);
  const data = Buffer.concat([c.update(value, "utf8"), c.final()]);
  const stored: Stored = { iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64"), last4: value.slice(-4), savedAt: new Date().toISOString(), savedBy: actorId };
  await db.appSetting.upsert({ where: { key: settingKey(name) }, create: { key: settingKey(name), value: stored, updatedBy: actorId }, update: { value: stored, updatedBy: actorId } });
  await audit(db, { actorId, action: "secret.save", entityType: "Secret", entityId: name, after: { last4: stored.last4 } });
  bust();
}

export async function deleteSecret(name: string, actorId: string | null) {
  await db.appSetting.deleteMany({ where: { key: settingKey(name) } });
  await audit(db, { actorId, action: "secret.delete", entityType: "Secret", entityId: name });
  bust();
}

const cache = new Map<string, { value: string | null; at: number }>();
const bust = () => cache.clear();

/** The decrypted secret, or null. Cached for a minute. */
export async function readSecret(name: string): Promise<string | null> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  const row = await db.appSetting.findUnique({ where: { key: settingKey(name) } }).catch(() => null);
  let value: string | null = null;
  if (row) {
    try {
      const s = row.value as Stored;
      const d = createDecipheriv("aes-256-gcm", keyFor(), Buffer.from(s.iv, "base64"));
      d.setAuthTag(Buffer.from(s.tag, "base64"));
      value = Buffer.concat([d.update(Buffer.from(s.data, "base64")), d.final()]).toString("utf8");
    } catch {
      value = null; // SESSION_SECRET changed: the key must be entered again
    }
  }
  cache.set(name, { value, at: Date.now() });
  return value;
}

/** For the admin page: whether a secret is saved, its last 4 characters and when. */
export async function secretInfo(name: string) {
  const row = await db.appSetting.findUnique({ where: { key: settingKey(name) } });
  if (!row) return null;
  const s = row.value as Stored;
  return { last4: s.last4, savedAt: new Date(s.savedAt), readable: (await readSecret(name)) !== null };
}
