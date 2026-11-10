import { ACHIEVEMENTS, LEVELS, type ManagerStats, levelFor } from "@/config/progression";
import { db, withTx } from "./db";
import { notify } from "./notifications";
import { grantPack } from "./packs";
import { creditXp } from "./wallet";

/** Lifetime XP earned (converting XP to MX never lowers your level). */
export async function lifetimeXp(userId: string) {
  const r = await db.walletEntry.aggregate({ where: { userId, bucket: "XP", amountMinor: { gt: 0 } }, _sum: { amountMinor: true } });
  return r._sum.amountMinor ?? 0;
}

export async function managerLevel(userId: string) {
  return levelFor(await lifetimeXp(userId));
}

/** Everything the achievements are checked against, gathered in one go. */
export async function managerStats(userId: string): Promise<ManagerStats> {
  const held = { ownerId: userId, supplyState: "HELD" as const };
  const [user, cards, golds, finishes, packsOpened, dropsSigned, entries, wins, podiums, best, captained, stampGroups, binders, challenges, sales, purchases, referrals, leagues, predictionsRight] =
    await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: userId }, select: { crest: true, foundingNumber: true, bestStreak: true } }),
      db.cardInstance.count({ where: held }),
      db.cardInstance.count({ where: { ...held, template: { category: "GOLD" } } }),
      db.cardFinish.groupBy({ by: ["kind"], where: { card: held }, _count: { _all: true } }),
      db.packOpening.count({ where: { userId } }),
      db.marketListing.count({ where: { buyerId: userId, house: true, status: "SOLD" } }),
      db.competitionEntry.count({ where: { userId, status: "ACTIVE" } }),
      db.competitionEntry.count({ where: { userId, rank: 1, competition: { status: "SETTLED" } } }),
      db.competitionEntry.count({ where: { userId, rank: { lte: 3 }, competition: { status: "SETTLED" } } }),
      db.competitionEntry.aggregate({ where: { userId }, _max: { finalPoints: true } }),
      db.competitionSelection.count({ where: { isCaptain: true, entry: { userId } } }),
      db.cardStamp.groupBy({ by: ["kind"], where: { userId }, _count: { _all: true } }),
      db.collectionCompletion.count({ where: { userId } }),
      db.challengeCompletion.count({ where: { userId } }),
      db.marketListing.count({ where: { sellerId: userId, house: false, status: "SOLD" } }),
      db.marketListing.count({ where: { buyerId: userId, house: false, status: "SOLD" } }),
      db.user.count({ where: { referredById: userId } }),
      db.miniLeagueMember.count({ where: { userId } }),
      db.predictionAnswer.count({ where: { userId, correct: true } }),
    ]);
  const finish = (k: string) => finishes.find((f) => f.kind === k)?._count._all ?? 0;
  const stamp = (k: string) => stampGroups.find((g) => g.kind === k)?._count._all ?? 0;
  return {
    cards,
    golds,
    rubies: finish("RUBY"),
    diamonds: finish("DIAMOND"),
    rainbows: finish("RAINBOW"),
    packsOpened,
    dropsSigned,
    entries,
    wins,
    podiums,
    bestScore: best._max.finalPoints ?? 0,
    captained,
    stamps: stampGroups.reduce((s, g) => s + g._count._all, 0),
    hatTrickStamps: stamp("HAT_TRICK"),
    captainHauls: stamp("CAPTAIN_HAUL"),
    cleanSheetStamps: stamp("CLEAN_SHEET"),
    binders,
    challenges,
    sales,
    purchases,
    referrals,
    hasCrest: !!user.crest,
    founder: !!user.foundingNumber,
    leagues,
    bestStreak: user.bestStreak,
    predictionsRight,
  };
}

/**
 * Unlock any achievements now earned (paying their XP) and grant any level-up packs now due.
 * Idempotent: every reward has a unique reference, so running it again does nothing new.
 */
export async function refreshProgress(userId: string) {
  const stats = await managerStats(userId);
  const have = new Set((await db.userAchievement.findMany({ where: { userId }, select: { code: true } })).map((a) => a.code));
  const earned = ACHIEVEMENTS.filter((a) => !have.has(a.code) && a.done(stats));
  for (const a of earned) {
    await withTx(async (tx) => {
      const made = await tx.userAchievement.createMany({ data: [{ userId, code: a.code }], skipDuplicates: true });
      if (made.count) await creditXp(tx, { userId, xp: a.xp, refId: `ach:${a.code}:${userId}`, note: `Achievement: ${a.name}` });
    });
    await notify(userId, { kind: "achievement", title: `Achievement unlocked: ${a.name}`, body: `${a.description} · +${a.xp} XP`, href: "/account/achievements", dedupeKey: `ach:${a.code}:${userId}` });
  }
  // Level-up rewards, for every level reached (catches up if several at once).
  const level = await managerLevel(userId);
  const newLevels: number[] = [];
  for (const l of LEVELS) {
    if (l.level > level.level || !l.reward) continue;
    const ref = `level:${userId}:${l.level}`;
    const already = await db.packEntitlement.findUnique({ where: { sourceRef: ref }, select: { id: true } });
    if (already) continue;
    await withTx((tx) => grantPack(tx, { userId, skuCode: l.reward!, source: "REWARD", sourceRef: ref }));
    newLevels.push(l.level);
    await notify(userId, { kind: "level", title: `Level ${l.level}: ${l.name}!`, body: "You've levelled up — a free pack is waiting in Packs.", href: "/packs", dedupeKey: ref });
  }
  return { unlocked: earned.map((a) => a.code), levels: newLevels, level };
}

/** Achievements board for a manager: every achievement, unlocked or not. */
export async function achievementBoard(userId: string) {
  const [rows, level] = await Promise.all([db.userAchievement.findMany({ where: { userId } }), managerLevel(userId)]);
  const at = new Map(rows.map((r) => [r.code, r.unlockedAt]));
  return {
    level,
    achievements: ACHIEVEMENTS.map((a) => ({ code: a.code, group: a.group, name: a.name, description: a.description, xp: a.xp, unlockedAt: at.get(a.code) ?? null })),
    unlocked: rows.length,
    total: ACHIEVEMENTS.length,
  };
}
