import type { Prisma } from "@/generated/prisma/client";
import { FINISH_VALUE } from "@/config/tiers";
import { stampCounts } from "./stamps";
import { loansLeft } from "./loans";
import { type CardView, toCardView } from "@/lib/view";
import { db } from "./db";
import { valueKey, valueTrends } from "./valuation";

export const CARD_INCLUDE = {
  template: { include: { player: { include: { club: { include: { league: true } } } } } },
  finish: { select: { kind: true, serial: true } },
} satisfies Prisma.CardInstanceInclude;

export type CardWithTemplate = Prisma.CardInstanceGetPayload<{ include: typeof CARD_INCLUDE }>;

/** How the current owner acquired each card: "Starter", "Packed", or what they paid. */
export async function acquisitionLabels(cardIds: string[]) {
  const out = new Map<string, string>();
  if (!cardIds.length) return out;
  const owns = await db.cardOwnership.findMany({ where: { cardId: { in: cardIds }, releasedAt: null } });
  const refs = owns.filter((o) => o.acquiredVia === "MARKET" && o.acquiredRef).map((o) => o.acquiredRef!);
  const ids = (prefix: string) => refs.filter((r) => r.startsWith(prefix)).map((r) => r.slice(prefix.length));
  const [orders, listings, auctions] = await Promise.all([
    db.order.findMany({ where: { id: { in: refs.filter((r) => !r.includes(":")) } } }),
    db.marketListing.findMany({ where: { id: { in: ids("listing:") } }, select: { id: true, soldPriceMinor: true } }),
    db.auction.findMany({ where: { id: { in: ids("auction:") } }, select: { id: true, winningBidMinor: true } }),
  ]);
  const paid = (ref: string | null): number | null => {
    if (!ref) return null;
    if (ref.startsWith("listing:")) return listings.find((l) => `listing:${l.id}` === ref)?.soldPriceMinor ?? null;
    if (ref.startsWith("auction:")) return auctions.find((a) => `auction:${a.id}` === ref)?.winningBidMinor ?? null;
    return orders.find((x) => x.id === ref)?.amountMinor ?? null;
  };
  for (const o of owns) {
    if (o.acquiredVia === "STARTER_PACK") out.set(o.cardId, "Starter");
    else if (o.acquiredVia === "WEEKLY_PACK") out.set(o.cardId, "Free pack");
    else if (o.acquiredVia === "PACK") out.set(o.cardId, "Packed");
    else if (o.acquiredVia === "MARKET") {
      const minor = paid(o.acquiredRef);
      out.set(o.cardId, minor !== null ? `Paid ${(minor / 100).toFixed(2)} MX` : o.acquiredRef?.startsWith("auction:") ? "Auction" : "Bought");
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

/** The last 20 valuations for each player+tier (oldest first), for row graphs. */
async function valueHistory(keys: Array<{ playerId: string; category: string }>) {
  const out = new Map<string, number[]>();
  if (!keys.length) return out;
  const ids = [...new Set(keys.map((k) => k.playerId))];
  const rows = await db.$queryRaw<Array<{ playerId: string; category: string; valueMp: number }>>`
    SELECT "playerId", category, "valueMp" FROM (
      SELECT "playerId", category, "valueMp", "computedAt",
             row_number() OVER (PARTITION BY "playerId", category ORDER BY "computedAt" DESC) AS rn
      FROM "MPValuation" WHERE "playerId" = ANY(${ids}::uuid[])
    ) t WHERE rn <= 20 ORDER BY "computedAt" ASC`;
  for (const r of rows) {
    const k = valueKey(r.playerId, r.category as never);
    out.set(k, [...(out.get(k) ?? []), r.valueMp]);
  }
  return out;
}

/** Turn DB cards into view models with value, trend, acquisition and points won for the owner. */
export async function enrichCards(cards: CardWithTemplate[]): Promise<CardView[]> {
  const [trends, acquired, points, loans, issued, stamps, history] = await Promise.all([
    valueTrends(cards.map((c) => ({ playerId: c.template.playerId, category: c.template.category }))),
    acquisitionLabels(cards.filter((c) => c.ownerId).map((c) => c.id)),
    pointsForOwners(cards),
    loansLeft(cards),
    issuedCounts([...new Set(cards.map((c) => c.templateId))]),
    stampCounts(cards.map((c) => c.id)),
    valueHistory(cards.map((c) => ({ playerId: c.template.playerId, category: c.template.category }))),
  ]);
  return cards.map((c) => {
    const t = trends.get(valueKey(c.template.playerId, c.template.category));
    return toCardView(c, {
      // Ruby 2×, Diamond 3×, Rainbow 4× the card's usual value.
      valueMp: t?.mp != null ? Math.round(t.mp * (c.finish ? FINISH_VALUE[c.finish.kind] : 1) * 100) / 100 : null,
      trendPct: t?.trendPct ?? null,
      acquired: c.loanGameweeks ? "Loan" : (acquired.get(c.id) ?? null),
      pointsForYou: points.get(c.id) ?? null,
      loan: loans.get(c.id),
      issued: issued.get(c.templateId),
      stamps: stamps.get(c.id) ?? 0,
      history: (history.get(valueKey(c.template.playerId, c.template.category)) ?? []).map((v) => Math.round(v * (c.finish ? FINISH_VALUE[c.finish.kind] : 1) * 100) / 100),
    });
  });
}

export async function cardViews(where: Prisma.CardInstanceWhereInput, orderBy?: Prisma.CardInstanceOrderByWithRelationInput[], take?: number): Promise<CardView[]> {
  const cards = await db.cardInstance.findMany({ where, include: CARD_INCLUDE, orderBy, take });
  return enrichCards(cards);
}

/** Copies of each design issued so far (everything not retired), for "148 issued of 500". */
export async function issuedCounts(templateIds: string[]) {
  if (!templateIds.length) return new Map<string, number>();
  const rows = await db.cardInstance.groupBy({ by: ["templateId"], where: { templateId: { in: templateIds }, supplyState: { not: "RETIRED" } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.templateId, r._count._all]));
}
