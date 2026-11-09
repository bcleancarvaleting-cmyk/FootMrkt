import type { Prisma } from "@/generated/prisma/client";
import { type CardView, gbp, toCardView } from "@/lib/view";
import { db } from "./db";
import { valueKey, valueTrends } from "./valuation";

export const CARD_INCLUDE = {
  template: { include: { player: { include: { club: { include: { league: true } } } } } },
} satisfies Prisma.CardInstanceInclude;

export type CardWithTemplate = Prisma.CardInstanceGetPayload<{ include: typeof CARD_INCLUDE }>;

/** How the current owner acquired each card: "Starter", "Packed", or what they paid. */
export async function acquisitionLabels(cardIds: string[]) {
  const out = new Map<string, string>();
  if (!cardIds.length) return out;
  const owns = await db.cardOwnership.findMany({ where: { cardId: { in: cardIds }, releasedAt: null } });
  const orderIds = owns.filter((o) => o.acquiredVia === "MARKET" && o.acquiredRef).map((o) => o.acquiredRef!);
  const orders = orderIds.length ? await db.order.findMany({ where: { id: { in: orderIds } } }) : [];
  for (const o of owns) {
    if (o.acquiredVia === "STARTER_PACK") out.set(o.cardId, "Starter");
    else if (o.acquiredVia === "WEEKLY_PACK") out.set(o.cardId, "Weekly");
    else if (o.acquiredVia === "PACK") out.set(o.cardId, "Packed");
    else if (o.acquiredVia === "MARKET") {
      const order = orders.find((x) => x.id === o.acquiredRef);
      out.set(o.cardId, order ? `Paid ${gbp(order.amountMinor)}` : "Bought");
    } else out.set(o.cardId, "Granted");
  }
  return out;
}

/** Points each card has won for its *current* owner (per account: a new owner starts at 0). */
export async function pointsForOwners(cards: Array<{ id: string; ownerId: string | null }>) {
  const owned = cards.filter((c) => c.ownerId);
  const out = new Map<string, number>();
  if (!owned.length) return out;
  const rows = await db.cardPoints.groupBy({
    by: ["cardId", "userId"],
    where: { cardId: { in: owned.map((c) => c.id) }, userId: { in: [...new Set(owned.map((c) => c.ownerId!))] } },
    _sum: { points: true },
  });
  for (const c of owned) {
    const r = rows.find((x) => x.cardId === c.id && x.userId === c.ownerId);
    out.set(c.id, r?._sum.points ?? 0);
  }
  return out;
}

/** Turn DB cards into view models with value, trend, acquisition and points won for the owner. */
export async function enrichCards(cards: CardWithTemplate[]): Promise<CardView[]> {
  const [trends, acquired, points] = await Promise.all([
    valueTrends(cards.map((c) => ({ playerId: c.template.playerId, category: c.template.category }))),
    acquisitionLabels(cards.filter((c) => c.ownerId).map((c) => c.id)),
    pointsForOwners(cards),
  ]);
  return cards.map((c) => {
    const t = trends.get(valueKey(c.template.playerId, c.template.category));
    return toCardView(c, {
      valueMp: t?.mp ?? null,
      trendPct: t?.trendPct ?? null,
      acquired: acquired.get(c.id) ?? null,
      pointsForYou: points.get(c.id) ?? null,
    });
  });
}

export async function cardViews(where: Prisma.CardInstanceWhereInput, orderBy?: Prisma.CardInstanceOrderByWithRelationInput[], take?: number): Promise<CardView[]> {
  const cards = await db.cardInstance.findMany({ where, include: CARD_INCLUDE, orderBy, take });
  return enrichCards(cards);
}
