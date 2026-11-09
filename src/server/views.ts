import type { Prisma } from "@/generated/prisma/client";
import { type CardView, toCardView } from "@/lib/view";
import { db } from "./db";
import { latestValues, valueKey } from "./valuation";

export const CARD_INCLUDE = {
  template: { include: { player: { include: { club: { include: { league: true } } } } } },
} satisfies Prisma.CardInstanceInclude;

export async function cardViews(where: Prisma.CardInstanceWhereInput, orderBy?: Prisma.CardInstanceOrderByWithRelationInput[]): Promise<CardView[]> {
  const cards = await db.cardInstance.findMany({ where, include: CARD_INCLUDE, orderBy });
  const values = await latestValues(cards.map((c) => ({ playerId: c.template.playerId, category: c.template.category })));
  return cards.map((c) => toCardView(c, { valueMp: values.get(valueKey(c.template.playerId, c.template.category)) ?? null }));
}
