import { db } from "./db";
import { getText } from "./settings";

/**
 * The daily admin report: yesterday's sign-ups, real card takings, packs bought and players sold
 * (product request 12 Nov 2026: "so we know what's coming in"). Emailed once each morning from
 * 08:00 UK time to every admin plus the extra addresses in Admin → Settings.
 */
const DAY = 86_400_000;

/** Midnight UK time at the start of the UK day containing `at`. */
export function ukMidnight(at: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  const offset = asUtc - Math.floor(at.getTime() / 60_000) * 60_000; // London minus UTC
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - offset);
}

const gbp = (m: number) => `£${(m / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function dailyReport(from: Date, to: Date) {
  const range = { gte: from, lt: to };
  const [users, signups, waitlist, orders, packsCredit, packsXp, houseSold, p2p, entries] = await Promise.all([
    db.user.count(),
    db.user.findMany({ where: { createdAt: range }, orderBy: { createdAt: "asc" }, select: { displayName: true, email: true, favouriteClub: { select: { name: true } }, referredById: true } }),
    db.waitlistEntry.count({ where: { createdAt: range } }),
    db.order.findMany({ where: { status: "PAID", provider: "stripe", updatedAt: range }, select: { kind: true, amountMinor: true } }),
    db.packEntitlement.count({ where: { source: "MP_CREDIT", sourceRef: { startsWith: "credit:" }, createdAt: range } }),
    db.packEntitlement.count({ where: { source: "MP_CREDIT", sourceRef: { startsWith: "xp:" }, createdAt: range } }),
    db.marketListing.aggregate({ where: { house: true, status: "SOLD", soldAt: range }, _count: { _all: true }, _sum: { soldPriceMinor: true } }),
    db.marketListing.aggregate({ where: { house: false, status: "SOLD", soldAt: range }, _count: { _all: true }, _sum: { soldPriceMinor: true, feeMinor: true } }),
    db.competitionEntry.count({ where: { createdAt: range } }),
  ]);
  const cardPacks = orders.filter((o) => o.kind === "PACK_PURCHASE");
  const topUps = orders.filter((o) => o.kind === "DEPOSIT");
  const revenueMinor = orders.reduce((s, o) => s + o.amountMinor, 0);
  const gaps = await (await import("./rare-demand")).watchedNotForSale(5).catch(() => ({ total: 0, rows: [] }));
  return {
    watchedGaps: { total: gaps.total, top: gaps.rows.map((g) => `${g.name} (${g.watchers} watching)`) },
    day: from.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" }),
    revenue: gbp(revenueMinor),
    revenueMinor,
    cardPacks: { count: cardPacks.length, total: gbp(cardPacks.reduce((s, o) => s + o.amountMinor, 0)) },
    topUps: { count: topUps.length, total: gbp(topUps.reduce((s, o) => s + o.amountMinor, 0)) },
    packsCredit,
    packsXp,
    signups: signups.length,
    signupList: signups.slice(0, 25).map((u) => `${u.displayName} · ${u.email}${u.favouriteClub ? ` · ${u.favouriteClub.name}` : ""}${u.referredById ? " · referred" : ""}`),
    waitlist,
    users,
    marketSold: { count: houseSold._count._all, total: gbp(houseSold._sum.soldPriceMinor ?? 0) },
    transfers: { count: p2p._count._all, total: gbp(p2p._sum.soldPriceMinor ?? 0), fees: gbp(p2p._sum.feeMinor ?? 0) },
    entries,
  };
}

export type DailyReport = Awaited<ReturnType<typeof dailyReport>>;

/** Who gets it: every admin, plus Admin → Settings → "Report emails". */
export async function reportRecipients() {
  const admins = await db.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { email: true } });
  const extra = (await getText("reportEmails")).split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  return [...new Set([...admins.map((a) => a.email.toLowerCase()), ...extra])];
}

/** Send yesterday's report once, from 08:00 UK time (the 5-minute job calls this). */
export async function sendDailyReport(now = new Date(), force = false) {
  const today = ukMidnight(now);
  const hourUk = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(now));
  if (!force && hourUk < 8) return { skipped: "before 8am" };
  const from = ukMidnight(new Date(today.getTime() - 12 * 3_600_000));
  const key = `admin.daily.${from.toISOString().slice(0, 10)}`;
  if (!force && (await db.appSetting.findUnique({ where: { key } }))) return { skipped: "sent" };
  const report = await dailyReport(from, today);
  const { sendEmail } = await import("./email/send");
  const to = await reportRecipients();
  for (const email of to) await sendEmail("adminDaily", { email }, { name: "Admin", ...report }, force ? undefined : `${key}:${email}`);
  await db.appSetting.upsert({ where: { key }, create: { key, value: now.getTime() }, update: { value: now.getTime() } });
  return { sent: to.length };
}

export const REPORT_WINDOW_MS = DAY;
