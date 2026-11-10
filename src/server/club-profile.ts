import { ACHIEVEMENTS } from "@/config/progression";
import { toCrest } from "@/lib/crest";
import { db } from "./db";
import { managerLevel } from "./progression";
import { CARD_INCLUDE, enrichCards } from "./views";

/**
 * A manager's public club page: crest, level, trophy cabinet (match wins and podiums, completed
 * binders, achievements), their rarest and best cards, and recent history stamps. Game data only —
 * nothing personal (no email, real name or address).
 */
export async function clubProfile(displayName: string) {
  const user = await db.user.findFirst({
    where: { displayName: { equals: displayName, mode: "insensitive" }, status: "ACTIVE" },
    select: { id: true, displayName: true, clubName: true, crest: true, foundingNumber: true, createdAt: true, favouriteClub: { select: { name: true } } },
  });
  if (!user) return null;
  const held = { ownerId: user.id, supplyState: "HELD" as const };
  const [level, wins, podiums, binders, achievements, special, best, stamped, stamps, cardCount] = await Promise.all([
    managerLevel(user.id),
    db.competitionEntry.findMany({
      where: { userId: user.id, rank: 1, competition: { status: "SETTLED" } },
      include: { competition: { select: { name: true, settledAt: true, gameweek: { select: { number: true, season: true } } } } },
      orderBy: { competition: { settledAt: "desc" } },
      take: 24,
    }),
    db.competitionEntry.count({ where: { userId: user.id, rank: { in: [2, 3] }, competition: { status: "SETTLED" } } }),
    db.collectionCompletion.findMany({ where: { userId: user.id }, include: { set: { select: { name: true } } }, orderBy: { completedAt: "desc" }, take: 24 }),
    db.userAchievement.findMany({ where: { userId: user.id }, orderBy: { unlockedAt: "desc" } }),
    db.cardInstance.findMany({ where: { ...held, finish: { isNot: null } }, include: CARD_INCLUDE, take: 12 }),
    db.cardInstance.findMany({ where: { ...held, finish: null, template: { category: "GOLD" } }, include: CARD_INCLUDE, take: 40 }),
    db.cardStamp.groupBy({ by: ["cardId"], where: { userId: user.id, card: held }, _count: { _all: true }, orderBy: { _count: { cardId: "desc" } }, take: 4 }),
    db.cardStamp.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8, include: { card: { select: { template: { select: { player: { select: { displayName: true } } } } } } } }),
    db.cardInstance.count({ where: held }),
  ]);
  const stampedCards = await db.cardInstance.findMany({ where: { id: { in: stamped.map((s) => s.cardId) } }, include: CARD_INCLUDE });
  const [specialViews, bestViews, stampedViews] = await Promise.all([enrichCards(special), enrichCards(best), enrichCards(stampedCards)]);
  const rank = (k: string | undefined) => (k === "RAINBOW" ? 3 : k === "DIAMOND" ? 2 : k === "RUBY" ? 1 : 0);
  const unlocked = new Map(achievements.map((a) => [a.code, a.unlockedAt]));
  return {
    manager: { name: user.displayName, clubName: user.clubName, crest: toCrest(user.crest), foundingNumber: user.foundingNumber, since: user.createdAt, supports: user.favouriteClub?.name ?? null, cards: cardCount },
    level,
    trophies: {
      wins: wins.map((w) => ({ name: w.competition.name, gameweek: w.competition.gameweek.number, season: w.competition.gameweek.season, at: w.competition.settledAt, points: w.finalPoints })),
      podiums,
      binders: binders.map((b) => ({ name: b.set.name, at: b.completedAt })),
    },
    achievements: ACHIEVEMENTS.filter((a) => unlocked.has(a.code)).map((a) => ({ code: a.code, name: a.name, description: a.description, at: unlocked.get(a.code)! })),
    achievementsTotal: ACHIEVEMENTS.length,
    showcase: [...specialViews].sort((a, b) => rank(b.finish?.kind) - rank(a.finish?.kind)),
    best: bestViews.sort((a, b) => (b.valueMp ?? 0) - (a.valueMp ?? 0)).slice(0, 6),
    storied: stampedViews.sort((a, b) => b.stamps - a.stamps),
    stamps: stamps.map((s) => ({ id: s.id, label: s.label, detail: s.detail, player: s.card.template.player.displayName, at: s.createdAt })),
  };
}
