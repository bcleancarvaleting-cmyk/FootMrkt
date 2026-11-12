import { ACHIEVEMENTS, LEVELS, type ManagerStats, STAGES, currentStage, levelFor } from "@/config/progression";
import { addMoment } from "./moments";
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
  const earned: typeof ACHIEVEMENTS = [];
  const stagesDone: number[] = [];
  // Work through the stages in order: unlock what's earned in the open stage; when it's complete,
  // bank its bonus and carry on into the next (so someone who's done a lot moves up several at once).
  for (;;) {
    const open = currentStage(have);
    const now = ACHIEVEMENTS.filter((a) => !have.has(a.code) && (a.stage === null || a.stage <= open) && a.done(stats));
    for (const a of now) {
      await withTx(async (tx) => {
        const made = await tx.userAchievement.createMany({ data: [{ userId, code: a.code }], skipDuplicates: true });
        if (made.count) await creditXp(tx, { userId, xp: a.xp, refId: `ach:${a.code}:${userId}`, note: `Achievement: ${a.name}` });
      });
      have.add(a.code);
      earned.push(a);
      await notify(userId, { kind: "achievement", title: `Achievement unlocked: ${a.name}`, body: `${a.description} · +${a.xp} XP`, href: "/account/achievements", dedupeKey: `ach:${a.code}:${userId}` });
    }
    const after = currentStage(have);
    for (const st of STAGES.filter((x) => x.stage < after)) {
      const code = `stage-${st.stage}`;
      if (have.has(code)) continue;
      const paid = await withTx(async (tx) => {
        const made = await tx.userAchievement.createMany({ data: [{ userId, code }], skipDuplicates: true });
        if (made.count) await creditXp(tx, { userId, xp: st.bonusXp, refId: `ach:${code}:${userId}`, note: `Stage ${st.stage} complete: ${st.name}` });
        return made.count > 0;
      });
      have.add(code);
      if (paid) {
        stagesDone.push(st.stage);
        const next = STAGES.find((x) => x.stage === st.stage + 1);
        await addMoment(userId, { kind: "stage", icon: "🏅", title: `Stage ${st.stage} complete`, subtitle: `${st.name} · +${st.bonusXp.toLocaleString("en-GB")} XP bonus`, href: "/account/achievements", cta: "See achievements", key: `moment:ach:${code}:${userId}` });
        await notify(userId, { kind: "achievement", title: `🏅 Stage ${st.stage} complete: ${st.name}`, body: `+${st.bonusXp.toLocaleString("en-GB")} XP bonus.${next ? ` Stage ${next.stage}, ${next.name}, is now open.` : " You've completed every stage!"}`, href: "/account/achievements", dedupeKey: `ach:${code}:${userId}` });
      }
    }
    if (after === open || !now.length) break;
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
    await addMoment(userId, { kind: "level", icon: "⭐", title: `Level ${l.level}`, subtitle: `You're now ${l.name} — a free pack is waiting.`, href: "/packs", cta: "Open my pack", key: `moment:${ref}` });
    await notify(userId, { kind: "level", title: `Level ${l.level}: ${l.name}!`, body: "You've levelled up — a free pack is waiting in Packs.", href: "/packs", dedupeKey: ref });
  }
  return { unlocked: earned.map((a) => a.code), stages: stagesDone, levels: newLevels, level };
}

/** Achievements board for a manager: every achievement, unlocked or not. */
export async function achievementBoard(userId: string) {
  const [rows, level] = await Promise.all([db.userAchievement.findMany({ where: { userId } }), managerLevel(userId)]);
  const at = new Map(rows.map((r) => [r.code, r.unlockedAt]));
  const stage = currentStage(new Set(at.keys()));
  const list = ACHIEVEMENTS.map((a) => ({ code: a.code, stage: a.stage, name: a.name, description: a.description, xp: a.xp, unlockedAt: at.get(a.code) ?? null }));
  return {
    level,
    stage,
    stages: STAGES.map((st) => {
      const items = list.filter((a) => a.stage === st.stage);
      const done = items.filter((a) => a.unlockedAt).length;
      return { ...st, items, done, total: items.length, complete: st.stage < stage, open: st.stage === stage, completedAt: at.get(`stage-${st.stage}`) ?? null };
    }),
    extras: list.filter((a) => a.stage === null),
    unlocked: list.filter((a) => a.unlockedAt).length,
    total: list.length,
  };
}
