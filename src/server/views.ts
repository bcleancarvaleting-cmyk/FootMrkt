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
    else if (o.acquiredVia === "PACK") out.set(o.cardId, "Packed");
    else if (o.acquiredVia === "MARKET") {
      const order = orders.find((x) => x.id === o.acquiredRef);
      out.set(o.cardId, order ? `Paid ${gbp(order.amountMinor)}` : "Bought");
    } else out.set(o.cardId, "Granted");
  }
  return out;
}

/** Turn DB cards into view models with value, trend and acquisition. */
export async function enrichCards(cards: CardWithTemplate[]): Promise<CardView[]> {
  const [trends, acquired] = await Promise.all([
    valueTrends(cards.map((c) => ({ playerId: c.template.playerId, category: c.template.category }))),
    acquisitionLabels(cards.filter((c) => c.ownerId).map((c) => c.id)),
  ]);
  return cards.map((c) => {
    const t = trends.get(valueKey(c.template.playerId, c.template.category));
    return toCardView(c, { valueMp: t?.mp ?? null, trendPct: t?.trendPct ?? null, acquired: acquired.get(c.id) ?? null });
  });
}

export async function cardViews(where: Prisma.CardInstanceWhereInput, orderBy?: Prisma.CardInstanceOrderByWithRelationInput[], take?: number): Promise<CardView[]> {
  const cards = await db.cardInstance.findMany({ where, include: CARD_INCLUDE, orderBy, take });
  return enrichCards(cards);
}
