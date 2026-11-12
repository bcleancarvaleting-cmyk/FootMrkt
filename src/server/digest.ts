import { createHmac, timingSafeEqual } from "node:crypto";
import { binder, portfolio } from "./binder";
import { db } from "./db";
import { APP_URL } from "./email/templates";
import { sendEmail } from "./email/send";

/**
 * The Friday digest: one email per manager each Friday from 11:00 UK time, built only from live
 * data (their players with a fixture this weekend, club value and its change, the next deadline and
 * how many open matches they're in, today's player drops). Sent in batches by the 5-minute job,
 * once per manager per Friday (EmailLog dedupe key), to active managers seen in the last 60 days
 * who haven't turned it off. Every email carries a signed one-click unsubscribe link.
 */
const DAY = 86_400_000;
const BATCH = 150;

const secret = () => process.env.SESSION_SECRET ?? "matchx-dev-session-secret";
export const digestToken = (userId: string) => createHmac("sha256", secret()).update(`digest-unsub:${userId}`).digest("base64url");
export const unsubscribeUrl = (userId: string) => `${APP_URL}/api/unsubscribe?u=${userId}&t=${digestToken(userId)}`;

export function checkDigestToken(userId: string, token: string) {
  const want = Buffer.from(digestToken(userId));
  const given = Buffer.from(token);
  return want.length === given.length && timingSafeEqual(want, given);
}

/** The UK calendar date, weekday and hour of a moment. */
function ukParts(now: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday as string, hour: Number(p.hour) };
}

const fmtWhen = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/** What goes in one manager's digest, or null if there's nothing true to tell them. */
export async function digestFor(userId: string, now = new Date(), shared?: { drops: number }) {
  const [cards, pf] = await Promise.all([binder(userId), portfolio(userId, now)]);
  // This weekend: from now until Tuesday 00:00 (covers Friday to Monday night games).
  const until = new Date(now.getTime() + 4 * DAY);
  const fixtures = await db.fixture.findMany({
    where: { status: "SCHEDULED", gameweek: { simulated: false }, kickoffAt: { gt: now, lt: until } },
    orderBy: { kickoffAt: "asc" },
    select: { kickoffAt: true, homeClub: { select: { code: true } }, awayClub: { select: { code: true } } },
  });
  const byClub = new Map<string, (typeof fixtures)[number]>();
  for (const f of fixtures) for (const c of [f.homeClub.code, f.awayClub.code]) if (!byClub.has(c)) byClub.set(c, f);
  const seen = new Set<string>();
  const playing = [...cards]
    .sort((a, b) => (b.valueMp ?? 0) - (a.valueMp ?? 0))
    .filter((c) => c.clubCode && byClub.has(c.clubCode) && !seen.has(c.playerId) && seen.add(c.playerId))
    .map((c) => {
      const f = byClub.get(c.clubCode!)!;
      return { name: c.name, vs: `${f.homeClub.code} v ${f.awayClub.code}`, when: fmtWhen(f.kickoffAt) };
    });

  const open = await db.competition.findMany({ where: { status: "OPEN", locksAt: { gt: now } }, select: { id: true, locksAt: true } });
  const entered = open.length ? await db.competitionEntry.count({ where: { userId, status: "ACTIVE", competitionId: { in: open.map((c) => c.id) } } }) : 0;
  const deadline = open.length ? new Date(Math.min(...open.map((c) => c.locksAt.getTime()))) : null;
  const drops = shared?.drops ?? (await (await import("./player-drops")).todaysDrops(now)).length;

  if (!cards.length && !open.length && !drops) return null;
  return {
    players: playing.slice(0, 5),
    playing: playing.length,
    value: pf.value,
    changePct: pf.changePct,
    deadline: deadline ? fmtWhen(deadline) : null,
    openMatches: open.length,
    entered,
    drops,
  };
}

export async function sendWeeklyDigests(now = new Date()) {
  const uk = ukParts(now);
  if (uk.weekday !== "Fri" || uk.hour < 11) return { skipped: "not Friday 11:00+" };
  const doneKey = `digest.done.${uk.date}`;
  if (await db.appSetting.findUnique({ where: { key: doneKey } })) return { skipped: "already sent" };

  const prefix = `digest:${uk.date}:`;
  const sent = new Set((await db.emailLog.findMany({ where: { dedupeKey: { startsWith: prefix } }, select: { userId: true } })).map((l) => l.userId));
  const users = await db.user.findMany({
    where: { status: "ACTIVE", weeklyDigest: true, emailVerifiedAt: { not: null }, lastSeenAt: { gte: new Date(now.getTime() - 60 * DAY) } },
    select: { id: true, email: true, displayName: true },
    orderBy: { id: "asc" },
  });
  const todo = users.filter((u) => !sent.has(u.id));
  const drops = (await (await import("./player-drops")).todaysDrops(now)).length;
  let count = 0;
  for (const u of todo.slice(0, BATCH)) {
    const d = await digestFor(u.id, now, { drops });
    if (d) {
      const url = unsubscribeUrl(u.id);
      await sendEmail("weeklyDigest", { userId: u.id, email: u.email }, { name: u.displayName, ...d, unsubscribeUrl: url }, `${prefix}${u.id}`, {
        "List-Unsubscribe": `<${url}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      });
      count++;
    } else {
      // Nothing to say: record it so the batch moves on.
      await db.emailLog.create({ data: { userId: u.id, to: u.email, template: "weeklyDigest", subject: "(skipped: nothing to report)", dedupeKey: `${prefix}${u.id}`, status: "LOGGED" } }).catch(() => null);
    }
  }
  if (todo.length <= BATCH) await db.appSetting.upsert({ where: { key: doneKey }, create: { key: doneKey, value: now.getTime() }, update: {} });
  return { sent: count, remaining: Math.max(0, todo.length - BATCH) };
}
