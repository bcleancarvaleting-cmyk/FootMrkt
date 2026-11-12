import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { APP_URL } from "./email/templates";
import { DomainError, isUniqueViolation } from "./errors";
import { grantPack } from "./packs";
import { getText } from "./settings";

/**
 * Pre-launch waitlist. People leave their email (plus name, club and where they came from) to hear
 * when MATCHX opens. Each gets a personal link: every friend who joins with it moves them up
 * PLACES_PER_FRIEND places in the queue. At launch, everyone is emailed (in batches) a link to
 * create their club, and registering with the same email gives them the waitlist launch gift.
 */
export const PLACES_PER_FRIEND = 10;
const BATCH = 200;

const secret = () => process.env.SESSION_SECRET ?? "matchx-dev-session-secret";
const sign = (id: string) => createHmac("sha256", secret()).update(`waitlist-unsub:${id}`).digest("base64url");
export const waitlistUnsubUrl = (id: string) => `${APP_URL}/api/unsubscribe?w=${id}&t=${sign(id)}`;
export function checkWaitlistToken(id: string, token: string) {
  const a = Buffer.from(sign(id));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const clean = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

export const JoinSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
  firstName: z.string().trim().max(40).optional(),
  clubCode: z.string().trim().max(8).optional(),
  over18: z.literal(true, { message: "MATCHX is for over-18s only." }),
  marketingOptIn: z.boolean().default(false),
  ref: z.string().trim().max(16).optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  referrerHost: z.string().optional(),
});

function code() {
  return randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 7).toLowerCase();
}

/** Join (or re-join: the same email returns the existing place). */
export async function joinWaitlist(input: z.input<typeof JoinSchema>) {
  const d = JoinSchema.parse(input);
  const existing = await db.waitlistEntry.findUnique({ where: { email: d.email } });
  if (existing) {
    if (existing.unsubscribedAt) await db.waitlistEntry.update({ where: { id: existing.id }, data: { unsubscribedAt: null } });
    return { entry: existing, created: false };
  }
  const club = d.clubCode && d.clubCode !== "none" ? await db.club.findUnique({ where: { code: d.clubCode }, select: { code: true } }) : null;
  const referrer = d.ref ? await db.waitlistEntry.findUnique({ where: { refCode: d.ref.toLowerCase() }, select: { refCode: true } }) : null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const entry = await withTx(async (tx) => {
        const e = await tx.waitlistEntry.create({
          data: {
            email: d.email,
            firstName: d.firstName || null,
            clubCode: club?.code ?? null,
            over18: true,
            marketingOptIn: d.marketingOptIn,
            refCode: code(),
            referredBy: referrer?.refCode ?? null,
            utmSource: clean(d.utmSource, 60) ?? null,
            utmMedium: clean(d.utmMedium, 60) ?? null,
            utmCampaign: clean(d.utmCampaign, 80) ?? null,
            referrerHost: clean(d.referrerHost, 120) ?? null,
          },
        });
        if (referrer) await tx.waitlistEntry.update({ where: { refCode: referrer.refCode }, data: { referrals: { increment: 1 } } });
        return e;
      });
      return { entry, created: true };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const again = await db.waitlistEntry.findUnique({ where: { email: d.email } });
      if (again) return { entry: again, created: false };
      // refCode clash: try another code
    }
  }
  throw new DomainError("BUSY", "Please try again.");
}

/** Place in the queue: signup order, moved up PLACES_PER_FRIEND for each friend who joined. */
export async function queuePosition(id: string) {
  const rows = await db.$queryRaw<Array<{ pos: bigint; total: bigint }>>`
    WITH q AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) - ${PLACES_PER_FRIEND} * referrals AS score, referrals, "createdAt"
      FROM "WaitlistEntry" WHERE "unsubscribedAt" IS NULL
    )
    -- On a tie, whoever got there by sharing goes first (they really do move up the full amount).
    SELECT (SELECT COUNT(*) FROM q AS o WHERE o.score < me.score OR (o.score = me.score AND (o.referrals > me.referrals OR (o.referrals = me.referrals AND o."createdAt" < me."createdAt")))) + 1 AS pos,
           (SELECT COUNT(*) FROM q) AS total
    FROM q AS me WHERE me.id = ${id}::uuid`;
  return rows[0] ? { position: Number(rows[0].pos), total: Number(rows[0].total) } : null;
}

export async function waitlistCount() {
  return db.waitlistEntry.count({ where: { unsubscribedAt: null } });
}

export const shareUrl = (refCode: string) => `${APP_URL}/launch?ref=${refCode}`;

/** Everything the "you're in" screen and email show. */
export async function waitlistStatus(id: string) {
  const e = await db.waitlistEntry.findUnique({ where: { id } });
  if (!e) return null;
  const q = await queuePosition(id);
  return { id: e.id, firstName: e.firstName, refCode: e.refCode, referrals: e.referrals, position: q?.position ?? null, total: q?.total ?? null, shareUrl: shareUrl(e.refCode) };
}

export async function launchGiftName() {
  const { FOOTBALL_PACKS } = await import("@/config/packs");
  const code = await getText("waitlistRewardSku");
  return FOOTBALL_PACKS.find((p) => p.code === code)?.name ?? "a free pack";
}

/** A new account: if their email was on the waitlist, mark it converted and give the launch gift. */
export async function convertWaitlist(userId: string, email: string) {
  const e = await db.waitlistEntry.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!e || e.convertedUserId) return false;
  const sku = await getText("waitlistRewardSku");
  await withTx(async (tx) => {
    const n = await tx.waitlistEntry.updateMany({ where: { id: e.id, convertedUserId: null }, data: { convertedUserId: userId, convertedAt: new Date() } });
    if (n.count && sku) await grantPack(tx, { userId, skuCode: sku, source: "REWARD", sourceRef: `waitlist:${e.id}` });
  });
  return true;
}

/** Admin: start emailing everyone that MATCHX is open. Sent in batches by the 5-minute job. */
export async function startLaunchEmails(adminId: string) {
  await db.appSetting.upsert({ where: { key: "waitlist.launchSending" }, create: { key: "waitlist.launchSending", value: true, updatedBy: adminId }, update: { value: true, updatedBy: adminId } });
  await audit(db, { actorId: adminId, action: "waitlist.launch-emails", entityType: "WaitlistEntry" });
  return sendLaunchEmails();
}

export async function sendLaunchEmails() {
  const on = await db.appSetting.findUnique({ where: { key: "waitlist.launchSending" } });
  if (on?.value !== true) return { skipped: "not started" };
  const todo = await db.waitlistEntry.findMany({ where: { launchEmailedAt: null, unsubscribedAt: null, convertedUserId: null }, orderBy: { createdAt: "asc" }, take: BATCH });
  const { sendEmail } = await import("./email/send");
  const gift = await launchGiftName();
  for (const e of todo) {
    const url = `${APP_URL}/register?email=${encodeURIComponent(e.email)}${e.clubCode ? `&club=${e.clubCode}` : ""}`;
    const unsub = waitlistUnsubUrl(e.id);
    await sendEmail("launchLive", { email: e.email }, { name: e.firstName ?? "there", url, gift, unsubscribeUrl: unsub }, `launch:${e.id}`, { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    await db.waitlistEntry.update({ where: { id: e.id }, data: { launchEmailedAt: new Date() } });
  }
  const left = await db.waitlistEntry.count({ where: { launchEmailedAt: null, unsubscribedAt: null, convertedUserId: null } });
  if (!left) await db.appSetting.update({ where: { key: "waitlist.launchSending" }, data: { value: false } });
  return { sent: todo.length, left };
}

/** Admin numbers: totals, growth, where people come from, clubs, conversion. */
export async function waitlistStats(now = new Date()) {
  const day = new Date(now.getTime() - 86_400_000);
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const [total, today, thisWeek, viaFriends, converted, emailed, unsub, optIn, byClub, bySource, byCampaign, recent, daily, sending] = await Promise.all([
    db.waitlistEntry.count(),
    db.waitlistEntry.count({ where: { createdAt: { gte: day } } }),
    db.waitlistEntry.count({ where: { createdAt: { gte: week } } }),
    db.waitlistEntry.count({ where: { referredBy: { not: null } } }),
    db.waitlistEntry.count({ where: { convertedUserId: { not: null } } }),
    db.waitlistEntry.count({ where: { launchEmailedAt: { not: null } } }),
    db.waitlistEntry.count({ where: { unsubscribedAt: { not: null } } }),
    db.waitlistEntry.count({ where: { marketingOptIn: true, unsubscribedAt: null } }),
    db.waitlistEntry.groupBy({ by: ["clubCode"], _count: { _all: true }, orderBy: { _count: { clubCode: "desc" } }, take: 12 }),
    db.waitlistEntry.groupBy({ by: ["utmSource"], _count: { _all: true }, orderBy: { _count: { utmSource: "desc" } }, take: 10 }),
    db.waitlistEntry.groupBy({ by: ["utmCampaign"], where: { utmCampaign: { not: null } }, _count: { _all: true }, orderBy: { _count: { utmCampaign: "desc" } }, take: 10 }),
    db.waitlistEntry.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.waitlistEntry.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, select: { createdAt: true } }),
    db.appSetting.findUnique({ where: { key: "waitlist.launchSending" } }),
  ]);
  const clubs = await db.club.findMany({ where: { code: { in: byClub.map((c) => c.clubCode).filter((c): c is string => !!c) } }, select: { code: true, name: true } });
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29 + i)));
  const perDay = days.map(() => 0);
  for (const r of daily) {
    const i = days.findLastIndex((d) => r.createdAt >= d);
    if (i >= 0) perDay[i]++;
  }
  const topReferrers = await db.waitlistEntry.findMany({ where: { referrals: { gt: 0 } }, orderBy: { referrals: "desc" }, take: 10, select: { email: true, firstName: true, referrals: true } });
  return {
    total,
    today,
    thisWeek,
    viaFriends,
    converted,
    emailed,
    unsub,
    optIn,
    sending: sending?.value === true,
    byClub: byClub.map((c) => ({ name: c.clubCode ? (clubs.find((x) => x.code === c.clubCode)?.name ?? c.clubCode) : "No club given", count: c._count._all })),
    bySource: bySource.map((s) => ({ name: s.utmSource ?? "Direct / unknown", count: s._count._all })),
    byCampaign: byCampaign.map((s) => ({ name: s.utmCampaign!, count: s._count._all })),
    daily: days.map((d, i) => ({ label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), value: perDay[i] })),
    topReferrers,
    recent,
  };
}

/** CSV of the whole list (admin download). */
export async function waitlistCsv() {
  const rows = await db.waitlistEntry.findMany({ orderBy: { createdAt: "asc" } });
  const esc = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
    // Quote everything; neutralise spreadsheet formulas.
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const cols = ["email", "firstName", "clubCode", "marketingOptIn", "referrals", "referredBy", "refCode", "utmSource", "utmMedium", "utmCampaign", "referrerHost", "createdAt", "launchEmailedAt", "convertedAt", "unsubscribedAt"] as const;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
