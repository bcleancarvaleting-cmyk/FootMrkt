import type { CardCategory, CardLock, Position, Prisma } from "@/generated/prisma/client";
import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer, toStatLine } from "@/domain/football/scoring";
import { db } from "./db";
import { DomainError } from "./errors";
import type { CardView } from "@/lib/view";
import { latestValues, valueKey } from "./valuation";
import { CARD_INCLUDE, enrichCards, issuedCounts } from "./views";

export interface BinderFilters {
  category?: CardCategory;
  position?: Position;
  club?: string;
  q?: string;
  status?: "available" | "locked" | "listed" | "competition" | "nontradeable";
  duplicates?: boolean;
  favourites?: boolean;
}

export type BinderCard = CardView & { favourite: boolean; duplicateCount: number };

export async function binder(userId: string, f: BinderFilters = {}) {
  const where: Prisma.CardInstanceWhereInput = { ownerId: userId, supplyState: "HELD" };
  const tpl: Prisma.CardTemplateWhereInput = {};
  const player: Prisma.PlayerWhereInput = {};
  if (f.category) tpl.category = f.category;
  if (f.position) player.position = f.position;
  if (f.club) player.club = { code: f.club };
  if (f.q) player.displayName = { contains: f.q, mode: "insensitive" };
  if (Object.keys(player).length) tpl.player = player;
  if (Object.keys(tpl).length) where.template = tpl;
  if (f.status === "available") where.lock = "NONE";
  if (f.status === "locked") where.lock = { not: "NONE" };
  if (f.status === "listed") where.lock = "LISTED";
  if (f.status === "competition") where.lock = "COMPETITION";
  if (f.status === "nontradeable") where.tradeStatus = "NON_TRADEABLE";
  if (f.favourites) where.favourites = { some: { userId } };

  const cards = await db.cardInstance.findMany({
    where,
    include: { ...CARD_INCLUDE, favourites: { where: { userId }, select: { userId: true } } },
    orderBy: [{ template: { category: "desc" } }, { template: { player: { position: "asc" } } }, { template: { player: { lastName: "asc" } } }],
  });
  const counts = new Map<string, number>();
  for (const c of await db.cardInstance.findMany({ where: { ownerId: userId, supplyState: "HELD" }, select: { template: { select: { playerId: true, category: true } } } })) {
    const k = valueKey(c.template.playerId, c.template.category);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const views = await enrichCards(cards);
  let out: BinderCard[] = views.map((v, i) => ({
    ...v,
    favourite: cards[i].favourites.length > 0,
    duplicateCount: counts.get(valueKey(v.playerId, v.category)) ?? 1,
  }));
  if (f.duplicates) out = out.filter((c) => c.duplicateCount > 1);
  return out;
}

export async function binderTotals(userId: string) {
  const rows = await db.$queryRaw<Array<{ sport: string; category: CardCategory; lock: CardLock; n: bigint }>>`
    SELECT s.code AS sport, t.category, ci."lock", COUNT(*) AS n
    FROM "CardInstance" ci JOIN "CardTemplate" t ON t.id = ci."templateId" JOIN "Player" p ON p.id = t."playerId"
    JOIN "Sport" s ON s.id = p."sportId"
    WHERE ci."ownerId" = ${userId}::uuid AND ci."supplyState" = 'HELD'
    GROUP BY s.code, t.category, ci."lock"`;
  const totals = { total: 0, byCategory: { BRONZE: 0, SILVER: 0, GOLD: 0 } as Record<CardCategory, number>, locked: 0, bySport: {} as Record<string, number> };
  for (const r of rows) {
    const n = Number(r.n);
    totals.total += n;
    totals.byCategory[r.category] += n;
    totals.bySport[r.sport] = (totals.bySport[r.sport] ?? 0) + n;
    if (r.lock !== "NONE") totals.locked += n;
  }
  return totals;
}

export async function cardDetail(cardId: string, viewerId: string | null) {
  const card = await db.cardInstance.findUnique({
    where: { id: cardId },
    include: {
      ...CARD_INCLUDE,
      owner: { select: { id: true, displayName: true } },
      ownerships: { orderBy: { acquiredAt: "asc" }, include: { user: { select: { displayName: true } } } },
      listings: { where: { status: "ACTIVE" } },
    },
  });
  if (!card) throw new DomainError("NOT_FOUND", "Card not found.");
  const valuations = await db.mPValuation.findMany({
    where: { playerId: card.template.playerId, category: card.template.category },
    orderBy: { computedAt: "asc" },
    take: 52,
  });
  const sales = await db.marketListing.findMany({
    where: { status: "SOLD", card: { template: { playerId: card.template.playerId, category: card.template.category } } },
    orderBy: { soldAt: "desc" },
    take: 10,
    select: { soldPriceMinor: true, soldAt: true, cardId: true },
  });
  return { card, valuations, sales, isOwner: viewerId !== null && card.ownerId === viewerId };
}

export async function playerProfile(playerId: string) {
  const player = await db.player.findUnique({ where: { id: playerId }, include: { club: { include: { league: true } }, templates: { where: { edition: "STANDARD" } } } });
  if (!player) throw new DomainError("NOT_FOUND", "Player not found.");
  const stats = await db.playerMatchStat.findMany({
    where: { playerId, isCurrent: true },
    include: { fixture: { include: { gameweek: true, homeClub: true, awayClub: true } } },
    orderBy: { fixture: { kickoffAt: "desc" } },
    take: 20,
  });
  const rules = getScoringRules(CURRENT_SCORING_RULES);
  const matches = stats.map((s) => {
    const line = toStatLine(s.stats);
    return { stat: s, line, points: scorePlayer(rules, player.position, [line]) };
  });
  const values = await latestValues(player.templates.map((t) => ({ playerId, category: t.category })));
  return { player, matches, values, issued: await issuedCounts(player.templates.map((t) => t.id)), diamonds: await db.cardFinish.count({ where: { playerId, kind: "DIAMOND" } }), rubies: await db.cardFinish.count({ where: { playerId, kind: "RUBY" } }) };
}
