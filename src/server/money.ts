import { db } from "./db";

/**
 * The admin money dashboard: real card takings (Stripe only — sandbox/test payments are shown
 * apart), what MATCHX owes (£ winnings not yet withdrawn, withdrawals waiting), prizes paid, and the
 * in-game MX economy (fees, drops, packs, entries). Everything is summed from the ledger and orders,
 * so it always matches the books. On screen only — no emails.
 */
const DAY = 86_400_000;

export async function moneyDashboard(now = new Date()) {
  const since = (days: number) => new Date(now.getTime() - days * DAY);
  const windows = [
    ["Last 24 hours", since(1)],
    ["Last 7 days", since(7)],
    ["Last 30 days", since(30)],
    ["All time", new Date(0)],
  ] as const;

  const card = await Promise.all(
    windows.map(async ([label, from]) => {
      const rows = await db.order.groupBy({
        by: ["kind", "status"],
        where: { provider: "stripe", createdAt: { gte: from }, status: { in: ["PAID", "REFUNDED"] } },
        _sum: { amountMinor: true },
        _count: { _all: true },
      });
      const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((s, r) => s + (r._sum.amountMinor ?? 0), 0);
      const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((s, r) => s + r._count._all, 0);
      return {
        label,
        paidMinor: sum((r) => r.status === "PAID"),
        payments: count((r) => r.status === "PAID"),
        packsMinor: sum((r) => r.status === "PAID" && r.kind === "PACK_PURCHASE"),
        bundlesMinor: sum((r) => r.status === "PAID" && r.kind === "DEPOSIT"),
        refundedMinor: sum((r) => r.status === "REFUNDED"),
      };
    }),
  );

  const from30 = since(30);
  const [daily, testPay, buckets, pendingW, paidW30, paidWAll, prizes30, prizesAll, p2p30, drops30, packsMx30, entries30, spenders, payers30] = await Promise.all([
    db.order.findMany({ where: { provider: "stripe", status: "PAID", createdAt: { gte: from30 } }, select: { amountMinor: true, createdAt: true } }),
    db.order.aggregate({ where: { provider: { not: "stripe" }, status: "PAID" }, _sum: { amountMinor: true }, _count: { _all: true } }),
    db.walletEntry.groupBy({ by: ["bucket"], _sum: { amountMinor: true } }),
    db.withdrawal.aggregate({ where: { status: "REQUESTED" }, _sum: { amountMinor: true }, _count: { _all: true } }),
    db.withdrawal.aggregate({ where: { status: "PAID", processedAt: { gte: from30 } }, _sum: { amountMinor: true }, _count: { _all: true } }),
    db.withdrawal.aggregate({ where: { status: "PAID" }, _sum: { amountMinor: true }, _count: { _all: true } }),
    db.walletEntry.aggregate({ where: { kind: "PRIZE", createdAt: { gte: from30 } }, _sum: { amountMinor: true } }),
    db.walletEntry.aggregate({ where: { kind: "PRIZE" }, _sum: { amountMinor: true } }),
    db.marketListing.aggregate({ where: { status: "SOLD", house: false, soldAt: { gte: from30 } }, _sum: { soldPriceMinor: true, feeMinor: true }, _count: { _all: true } }),
    db.marketListing.aggregate({ where: { status: "SOLD", house: true, soldAt: { gte: from30 } }, _sum: { soldPriceMinor: true }, _count: { _all: true } }),
    db.walletEntry.aggregate({ where: { kind: "PACK_PURCHASE", createdAt: { gte: from30 } }, _sum: { amountMinor: true } }),
    db.walletEntry.aggregate({ where: { kind: { in: ["ENTRY_FEE", "ENTRY_REFUND"] }, createdAt: { gte: from30 } }, _sum: { amountMinor: true } }),
    db.order.groupBy({ by: ["userId"], where: { provider: "stripe", status: "PAID", createdAt: { gte: from30 } }, _sum: { amountMinor: true }, _count: { _all: true }, orderBy: { _sum: { amountMinor: "desc" } }, take: 10 }),
    db.order.findMany({ where: { provider: "stripe", status: "PAID", createdAt: { gte: from30 } }, distinct: ["userId"], select: { userId: true } }),
  ]);

  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29 + i)));
  const perDay = days.map(() => 0);
  for (const o of daily) {
    const i = days.findLastIndex((d) => o.createdAt >= d);
    if (i >= 0) perDay[i] += o.amountMinor;
  }
  const bucket = (b: string) => buckets.find((x) => x.bucket === b)?._sum.amountMinor ?? 0;
  const users = await db.user.findMany({ where: { id: { in: spenders.map((s) => s.userId) } }, select: { id: true, displayName: true, depositLimitMonthlyMinor: true } });

  return {
    card,
    daily: days.map((d, i) => ({ label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), value: perDay[i] / 100 })),
    payers30: payers30.length,
    test: { minor: testPay._sum.amountMinor ?? 0, count: testPay._count._all },
    owed: {
      winningsMinor: bucket("WINNINGS"),
      pendingWithdrawalsMinor: pendingW._sum.amountMinor ?? 0,
      pendingWithdrawals: pendingW._count._all,
      paid30Minor: paidW30._sum.amountMinor ?? 0,
      paidAllMinor: paidWAll._sum.amountMinor ?? 0,
      prizes30Minor: prizes30._sum.amountMinor ?? 0,
      prizesAllMinor: prizesAll._sum.amountMinor ?? 0,
    },
    mx: {
      boughtMinor: bucket("CASH"),
      earnedMinor: bucket("BONUS"),
      xp: bucket("XP"),
      p2pVolumeMinor: p2p30._sum.soldPriceMinor ?? 0,
      p2pFeesMinor: p2p30._sum.feeMinor ?? 0,
      p2pSales: p2p30._count._all,
      dropsMinor: drops30._sum.soldPriceMinor ?? 0,
      drops: drops30._count._all,
      packsMinor: -(packsMx30._sum.amountMinor ?? 0),
      entriesMinor: -(entries30._sum.amountMinor ?? 0),
    },
    spenders: spenders.map((s) => ({ userId: s.userId, name: users.find((u) => u.id === s.userId)?.displayName ?? "—", minor: s._sum.amountMinor ?? 0, payments: s._count._all, limitMinor: users.find((u) => u.id === s.userId)?.depositLimitMonthlyMinor ?? null })),
  };
}
