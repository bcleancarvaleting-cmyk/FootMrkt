import { toKit } from "@/lib/kit";
import { db } from "./db";
import { posterCards } from "./social";

/** Every club, grouped by league, for the public /teams index. */
export async function teamsIndex() {
  const leagues = await db.league.findMany({
    orderBy: { tier: "asc" },
    include: { clubs: { orderBy: { name: "asc" }, select: { code: true, name: true, shortName: true, primaryColour: true, secondaryColour: true, kit: true, crestUrl: true } } },
  });
  return leagues.map((l) => ({ code: l.code, name: l.name, clubs: l.clubs.map((c) => ({ ...c, kit: toKit(c.kit, c.primaryColour, c.secondaryColour) })) }));
}

/**
 * A real club's public landing page: its MATCHX cards (most valuable first), how many managers
 * support it, how many of its Rainbows have been found, what's on the Transfer list and the next
 * fixture. Public: shared in club-specific adverts and fan groups.
 */
export async function teamPage(code: string, now = new Date()) {
  const club = await db.club.findUnique({ where: { code }, include: { league: true } });
  if (!club) return null;
  const players = await db.player.findMany({
    where: { clubId: club.id, active: true, templates: { some: { edition: "STANDARD", active: true } } },
    select: { id: true },
  });
  const ids = players.map((p) => p.id);
  const [cards, supporters, rainbows, listed, next, collected] = await Promise.all([
    posterCards(ids),
    db.user.count({ where: { favouriteClubId: club.id, status: "ACTIVE" } }),
    db.cardFinish.count({ where: { kind: "RAINBOW", playerId: { in: ids } } }),
    db.marketListing.count({ where: { status: "ACTIVE", card: { template: { playerId: { in: ids } } }, OR: [{ liveAt: null }, { liveAt: { lte: now } }] } }),
    db.fixture.findFirst({
      where: { status: "SCHEDULED", kickoffAt: { gt: now }, OR: [{ homeClubId: club.id }, { awayClubId: club.id }] },
      orderBy: { kickoffAt: "asc" },
      select: { kickoffAt: true, homeClub: { select: { name: true, code: true } }, awayClub: { select: { name: true, code: true } } },
    }),
    db.cardInstance.count({ where: { ownerId: { not: null }, supplyState: "HELD", template: { playerId: { in: ids } } } }),
  ]);
  const sorted = [...cards].sort((a, b) => ({ GOLD: 0, SILVER: 1, BRONZE: 2 })[a.category] - ({ GOLD: 0, SILVER: 1, BRONZE: 2 })[b.category] || (b.valueMp ?? 0) - (a.valueMp ?? 0) || a.name.localeCompare(b.name));
  return {
    club: { ...club, kit: toKit(club.kit, club.primaryColour, club.secondaryColour) },
    cards: sorted,
    supporters,
    rainbows,
    listed,
    collected,
    next,
  };
}
