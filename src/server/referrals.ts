import { db, withTx } from "./db";
import { notify } from "./notifications";
import { grantPack } from "./packs";

/**
 * Top recruiters (product decision 11 Nov 2026): who brought the most friends this month. A friend
 * only counts once they've joined with the manager's link AND played their first match — the same
 * moment the invite reward is paid — so fake sign-ups don't count. On the 1st, last month's top 3
 * (at least one friend each) get the prize pack set in Admin → Settings.
 */
const monthKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);

function monthRange(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - 3_600_000), to: new Date(Date.UTC(y, m, 1) - 3_600_000) }; // ≈ UK midnight (BST-safe enough for a monthly board)
}

export async function recruiterBoard(key = monthKey(new Date()), take = 10) {
  const { from, to } = monthRange(key);
  const rows = await db.packEntitlement.groupBy({
    by: ["userId"],
    where: { sourceRef: { startsWith: "referral:" }, createdAt: { gte: from, lt: to } },
    _count: { _all: true },
    orderBy: { _count: { userId: "desc" } },
    take,
  });
  const users = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true, foundingNumber: true, status: true } })).map((u) => [u.id, u]));
  return rows
    .filter((r) => users.get(r.userId)?.status === "ACTIVE")
    .map((r, i) => ({ rank: i + 1, userId: r.userId, name: users.get(r.userId)!.displayName, foundingNumber: users.get(r.userId)!.foundingNumber, friends: r._count._all }));
}

/** Scheduled job: on (or after) the 1st, pay last month's top 3 once. */
export async function payRecruiterPrizes(now = new Date()) {
  const thisMonth = monthKey(now);
  const prev = monthKey(new Date(monthRange(thisMonth).from.getTime() - 86_400_000 * 2));
  const key = `referral.prizes.${prev}`;
  if (await db.appSetting.findUnique({ where: { key } })) return 0;
  const { getText } = await import("./settings");
  const sku = await getText("referralMonthlyPrizeSku");
  const top = (await recruiterBoard(prev, 3)).filter((r) => r.friends > 0);
  for (const r of top) {
    const ref = `referral-month:${prev}:${r.userId}`;
    await withTx(async (tx) => {
      if (await tx.packEntitlement.findUnique({ where: { sourceRef: ref } })) return;
      await grantPack(tx, { userId: r.userId, skuCode: sku, source: "REWARD", sourceRef: ref });
    });
    await notify(r.userId, { kind: "PACK", title: `🏆 Top recruiter — ${r.rank === 1 ? "1st" : r.rank === 2 ? "2nd" : "3rd"} place!`, body: `You brought ${r.friends} friend${r.friends > 1 ? "s" : ""} to MATCHX last month. A free prize pack is waiting on Packs.`, href: "/packs", dedupeKey: ref }).catch(() => {});
  }
  await db.appSetting.create({ data: { key, value: top.map((t) => ({ userId: t.userId, friends: t.friends })) as never } });
  return top.length;
}

/**
 * Refer a friend, extras (product decision 13 Nov 2026):
 *  • XP for every friend who signs up with your link, and more the first time they buy a pack.
 *  • Milestone gifts at 1, 5, 20 and 100 friends (admin-set; tradeable shop packs or £ credit).
 * A friend counts towards milestones once they've played a match — the same rule as the invite pack
 * and the monthly board — so fake sign-ups don't unlock gifts.
 */
export async function referralSignupXp(tx: import("./db").Tx, friendId: string, referrerId: string) {
  const { getSetting } = await import("./settings");
  const xp = await getSetting("referralSignupXp");
  if (xp > 0) await (await import("./wallet")).creditXp(tx, { userId: referrerId, xp, refId: `ref-signup:${friendId}`, note: "A friend joined with your link" });
}

export async function referralPackXp(tx: import("./db").Tx, friendId: string) {
  const u = await tx.user.findUnique({ where: { id: friendId }, select: { referredById: true, displayName: true } });
  if (!u?.referredById) return;
  const { getSetting } = await import("./settings");
  const xp = await getSetting("referralPackXp");
  if (xp > 0) await (await import("./wallet")).creditXp(tx, { userId: u.referredById, xp, refId: `ref-pack:${friendId}`, note: `${u.displayName} bought a pack` });
}

/** Friends who count: joined with the link and played a match (one invite pack each). */
export async function qualifiedFriends(tx: import("./db").Tx | typeof db, referrerId: string) {
  return tx.packEntitlement.count({ where: { userId: referrerId, sourceRef: { startsWith: "referral:" } } });
}

/** Give any milestone gifts the manager has reached and not had yet. */
export async function payMilestones(tx: import("./db").Tx, referrerId: string) {
  const { getText, parseMilestones } = await import("./settings");
  const milestones = await parseMilestones(await getText("referralMilestones")).catch(() => []);
  const n = await qualifiedFriends(tx, referrerId);
  const given: number[] = [];
  for (const m of milestones) {
    if (n < m.friends) break;
    const ref = `ref-milestone:${referrerId}:${m.friends}`;
    if ("pack" in m.gift) {
      if (await tx.packEntitlement.findUnique({ where: { sourceRef: ref } })) continue;
      await grantPack(tx, { userId: referrerId, skuCode: m.gift.pack, source: "REWARD", sourceRef: ref });
    } else {
      if (await tx.walletEntry.findUnique({ where: { refId: ref } })) continue;
      await (await import("./wallet")).credit(tx, { userId: referrerId, amountMinor: m.gift.cashMinor, kind: "CHALLENGE_REWARD", bucket: "BONUS", refId: ref, note: `${m.friends} friend milestone` });
    }
    given.push(m.friends);
  }
  return given;
}

/** For the invite panel: milestones with progress. */
export async function milestoneProgress(referrerId: string) {
  const { getText, parseMilestones } = await import("./settings");
  const [milestones, n] = await Promise.all([parseMilestones(await getText("referralMilestones")).catch(() => []), qualifiedFriends(db, referrerId)]);
  return { friends: n, milestones: milestones.map((m) => ({ ...m, reached: n >= m.friends, label: "pack" in m.gift ? m.gift.name : `£${(m.gift.cashMinor / 100).toFixed(2)}` })) };
}
