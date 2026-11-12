import { FINISHES } from "@/config/tiers";
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
  how: "market" | "pack" | "pull";
  /** Rare pulls: the special finish and its number. */
  finish?: { kind: "RUBY" | "DIAMOND" | "RAINBOW"; serial: number; of: number };
  manager?: string;
}

export async function recentSignings(since: Date, take = 8): Promise<Signing[]> {
  const rows = await db.cardOwnership.findMany({
    where: {
      acquiredAt: { gt: since },
      OR: [{ acquiredVia: "MARKET" }, { acquiredVia: "PACK", card: { finish: null, template: { category: { in: ["SILVER", "GOLD"] } } } }],
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
  // Rare pulls — Ruby, Diamond and Rainbow cards straight out of a pack — for everyone to see.
  const pulls = await db.cardFinish.findMany({
    where: { createdAt: { gt: since }, card: { owner: { status: "ACTIVE" } } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, serial: true, createdAt: true, player: { select: { id: true, displayName: true } }, card: { select: { owner: { select: { displayName: true, clubName: true } } } } },
  });
  const signed = rows.map((r) => ({
    id: r.id,
    at: r.acquiredAt.toISOString(),
    player: r.card.template.player.displayName,
    playerId: r.card.template.player.id,
    tier: r.card.template.category as Signing["tier"],
    club: r.user.clubName || `${r.user.displayName}'s club`,
    how: (r.acquiredVia === "MARKET" ? "market" : "pack") as Signing["how"],
  }));
  const rare: Signing[] = pulls.map((f) => ({
    id: `pull:${f.id}`,
    at: f.createdAt.toISOString(),
    player: f.player.displayName,
    playerId: f.player.id,
    tier: "GOLD",
    club: f.card.owner?.clubName || `${f.card.owner?.displayName ?? "A manager"}'s club`,
    manager: f.card.owner?.displayName ?? "A manager",
    how: "pull",
    finish: { kind: f.kind as "RUBY" | "DIAMOND" | "RAINBOW", serial: f.serial, of: f.kind === "RAINBOW" ? 1 : ((FINISHES as Record<string, { perPlayer?: number }>)[f.kind]?.perPlayer ?? 0) },
  }));
  // Signed-on pack pulls that are also rare show once, as the rare pull.
  return [...rare, ...signed].sort((a, b) => b.at.localeCompare(a.at)).slice(0, take);
}
