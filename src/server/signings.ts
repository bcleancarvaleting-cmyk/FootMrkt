import { db } from "./db";

/**
 * "Player X has signed for Club Y": recent signings across MATCHX — players bought on the market
 * or at auction, and Silver/Gold pulls from packs — for the pop-up that shows them as they happen.
 * Only club names and public player names; nothing private.
 */
export interface Signing {
  id: string;
  at: string;
  player: string;
  playerId: string;
  tier: "BRONZE" | "SILVER" | "GOLD";
  club: string;
  how: "market" | "pack";
}

export async function recentSignings(since: Date, take = 8): Promise<Signing[]> {
  const rows = await db.cardOwnership.findMany({
    where: {
      acquiredAt: { gt: since },
      OR: [{ acquiredVia: "MARKET" }, { acquiredVia: "PACK", card: { template: { category: { in: ["SILVER", "GOLD"] } } } }],
      user: { status: "ACTIVE" },
    },
    orderBy: { acquiredAt: "desc" },
    take,
    select: {
      id: true,
      acquiredAt: true,
      acquiredVia: true,
      user: { select: { displayName: true, clubName: true } },
      card: { select: { template: { select: { category: true, player: { select: { id: true, displayName: true } } } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    at: r.acquiredAt.toISOString(),
    player: r.card.template.player.displayName,
    playerId: r.card.template.player.id,
    tier: r.card.template.category as Signing["tier"],
    club: r.user.clubName || `${r.user.displayName}'s club`,
    how: r.acquiredVia === "MARKET" ? "market" : "pack",
  }));
}
