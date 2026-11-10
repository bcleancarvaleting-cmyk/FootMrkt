import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { DomainError } from "./errors";

/**
 * Safer play. Players set their own card-spend limits (day / week / month) across top-ups and paid
 * packs, take a short break, or self-exclude. Lowering a limit applies at once; raising or removing
 * one waits out a 24-hour cooling-off period. During a break or exclusion the player can't log in.
 */
export const COOLING_OFF_MS = 24 * 3600_000;
export const TIME_OUTS = [
  ["24h", "24 hours", 24 * 3600_000],
  ["7d", "1 week", 7 * 24 * 3600_000],
  ["6w", "6 weeks", 42 * 24 * 3600_000],
] as const;
export const EXCLUSIONS = [
  ["6m", "6 months", 182],
  ["1y", "1 year", 365],
  ["5y", "5 years", 5 * 365],
] as const;
export const REALITY_CHECKS = [0, 30, 60, 120] as const;

export type Limits = { daily: number | null; weekly: number | null; monthly: number | null };
const KEYS = ["daily", "weekly", "monthly"] as const;

/** Card money paid in a window: top-ups and paid packs. */
async function spentSince(userId: string, since: Date) {
  const r = await db.order.aggregate({ where: { userId, status: "PAID", kind: { in: ["DEPOSIT", "PACK_PURCHASE"] }, createdAt: { gte: since } }, _sum: { amountMinor: true } });
  return r._sum.amountMinor ?? 0;
}

function windows(now = new Date()) {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  const month = new Date(day);
  month.setUTCDate(1);
  return { daily: day, weekly: new Date(now.getTime() - 7 * 24 * 3600_000), monthly: month };
}

/** Apply pending (raised) limits once their cooling-off has passed. */
async function settlePending(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (u.pendingLimits && u.pendingLimitsAt && u.pendingLimitsAt <= new Date()) {
    const p = u.pendingLimits as Limits;
    return db.user.update({
      where: { id: userId },
      data: { limitDailyMinor: p.daily, limitWeeklyMinor: p.weekly, depositLimitMonthlyMinor: p.monthly, pendingLimits: Prisma.DbNull, pendingLimitsAt: null },
    });
  }
  return u;
}

export const currentLimits = (u: { limitDailyMinor: number | null; limitWeeklyMinor: number | null; depositLimitMonthlyMinor: number | null }): Limits => ({
  daily: u.limitDailyMinor,
  weekly: u.limitWeeklyMinor,
  monthly: u.depositLimitMonthlyMinor,
});

/** Throws if the player is on a break or this payment would go over one of their limits. */
export async function assertCanSpend(userId: string, amountMinor: number) {
  const u = await settlePending(userId);
  blockIfPaused(u);
  const limits = currentLimits(u);
  const w = windows();
  const label = { daily: "today's", weekly: "this week's", monthly: "this month's" } as const;
  for (const k of KEYS) {
    const cap = limits[k];
    if (cap === null) continue;
    const spent = await spentSince(userId, w[k]);
    if (spent + amountMinor > cap) {
      throw new DomainError("LIMIT", `This would go over ${label[k]} spend limit of £${(cap / 100).toFixed(2)} (£${(spent / 100).toFixed(2)} used). You can change your limits in Safer play.`);
    }
  }
}

export function blockIfPaused(u: { timeOutUntil: Date | null; selfExcludedUntil: Date | null }, now = new Date()) {
  if (u.selfExcludedUntil && u.selfExcludedUntil > now) {
    throw new DomainError("SELF_EXCLUDED", `You've self-excluded until ${u.selfExcludedUntil.toLocaleDateString("en-GB")}. If you need help, contact support or visit begambleaware.org.`);
  }
  if (u.timeOutUntil && u.timeOutUntil > now) {
    throw new DomainError("TIME_OUT", `You're taking a break until ${u.timeOutUntil.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`);
  }
}

/** Save limits: lower ones now, higher or removed ones after 24 hours. */
export async function setLimits(userId: string, next: Limits) {
  for (const k of KEYS) {
    const v = next[k];
    if (v !== null && (!Number.isInteger(v) || v < 500 || v > 500_000)) throw new DomainError("LIMIT", "Each limit must be between £5 and £5,000, or blank for none.");
  }
  if (next.daily !== null && next.weekly !== null && next.daily > next.weekly) throw new DomainError("LIMIT", "Your daily limit can't be more than your weekly limit.");
  if (next.weekly !== null && next.monthly !== null && next.weekly > next.monthly) throw new DomainError("LIMIT", "Your weekly limit can't be more than your monthly limit.");
  const u = await settlePending(userId);
  const now = currentLimits(u);
  const looser = (a: number | null, b: number | null) => b === null ? a !== null : a !== null && b > a; // b looser than a
  const immediate: Limits = { ...now };
  let waits = false;
  for (const k of KEYS) {
    if (looser(now[k], next[k])) waits = true;
    else immediate[k] = next[k];
  }
  await db.user.update({
    where: { id: userId },
    data: {
      limitDailyMinor: immediate.daily,
      limitWeeklyMinor: immediate.weekly,
      depositLimitMonthlyMinor: immediate.monthly,
      pendingLimits: waits ? next : Prisma.DbNull,
      pendingLimitsAt: waits ? new Date(Date.now() + COOLING_OFF_MS) : null,
    },
  });
  return { waits };
}

/** Take a break or self-exclude. Logs the player out everywhere. */
export async function pauseAccount(userId: string, kind: "timeout" | "exclusion", code: string) {
  const now = Date.now();
  let data: { timeOutUntil?: Date; selfExcludedUntil?: Date };
  if (kind === "timeout") {
    const t = TIME_OUTS.find(([c]) => c === code);
    if (!t) throw new DomainError("BAD_INPUT", "Pick how long your break should be.");
    data = { timeOutUntil: new Date(now + t[2]) };
  } else {
    const e = EXCLUSIONS.find(([c]) => c === code);
    if (!e) throw new DomainError("BAD_INPUT", "Pick how long to exclude yourself for.");
    data = { selfExcludedUntil: new Date(now + e[2] * 24 * 3600_000) };
  }
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { ...data, marketingOptIn: kind === "exclusion" ? false : undefined } }),
    // Close open listings so nothing sells while they're away.
    db.marketListing.updateMany({ where: { sellerId: userId, status: "ACTIVE" }, data: { status: "CANCELLED" } }),
    db.session.deleteMany({ where: { userId } }),
  ]);
}

export async function setRealityCheck(userId: string, minutes: number) {
  if (!(REALITY_CHECKS as readonly number[]).includes(minutes)) throw new DomainError("BAD_INPUT", "Pick a reality-check interval.");
  await db.user.update({ where: { id: userId }, data: { realityCheckMinutes: minutes } });
}

/** Everything paid by card, newest first, with day / week / month totals. */
export async function spendHistory(userId: string) {
  const w = windows();
  const [orders, day, week, month, all] = await Promise.all([
    db.order.findMany({ where: { userId, status: { in: ["PAID", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, take: 100 }),
    spentSince(userId, w.daily),
    spentSince(userId, w.weekly),
    spentSince(userId, w.monthly),
    spentSince(userId, new Date(0)),
  ]);
  const skuIds = orders.filter((o) => o.kind === "PACK_PURCHASE").map((o) => o.refId);
  const skus = skuIds.length ? await db.packSku.findMany({ where: { id: { in: skuIds } }, select: { id: true, name: true } }) : [];
  return {
    totals: { day, week, month, all },
    rows: orders.map((o) => ({
      id: o.id,
      at: o.createdAt,
      what: o.kind === "DEPOSIT" ? "Wallet top-up" : o.kind === "PACK_PURCHASE" ? (skus.find((s) => s.id === o.refId)?.name ?? "Pack") : "Order",
      amountMinor: o.amountMinor,
      status: o.status,
    })),
  };
}

/** Card money paid today (for the reality check). */
export async function spentToday(userId: string) {
  return spentSince(userId, windows().daily);
}
