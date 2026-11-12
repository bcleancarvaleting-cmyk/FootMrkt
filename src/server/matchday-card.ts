import type { SquadScore } from "@/domain/football/scoring";
import { db } from "./db";
import { posterCards } from "./social";

/**
 * The manager's matchday, ready to share: their best entry of the latest gameweek (live while it's
 * being played), its points and rank, and their top scorers that week.
 */
export async function matchdayCard(userId: string) {
  const entry = await db.competitionEntry.findFirst({
    where: { userId, status: "ACTIVE", competition: { status: { in: ["PROVISIONAL", "SETTLED"] } } },
    orderBy: [{ competition: { gameweek: { season: "desc" } } }, { competition: { gameweek: { number: "desc" } } }, { finalPoints: { sort: "desc", nulls: "last" } }, { provisionalPoints: { sort: "desc", nulls: "last" } }],
    include: { competition: { include: { gameweek: true } }, user: { select: { displayName: true, clubName: true } } },
  });
  if (!entry) return null;
  const points = entry.finalPoints ?? entry.provisionalPoints ?? 0;
  const [ahead, entries, calc] = await Promise.all([
    db.competitionEntry.count({ where: { competitionId: entry.competitionId, status: "ACTIVE", OR: [{ finalPoints: { gt: points } }, { finalPoints: null, provisionalPoints: { gt: points } }] } }),
    db.competitionEntry.count({ where: { competitionId: entry.competitionId, status: "ACTIVE" } }),
    db.scoreCalculation.findFirst({ where: { entryId: entry.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const sels = ((calc?.breakdown as unknown as SquadScore | null)?.selections ?? []).filter((s) => s.counted).sort((a, b) => b.points - a.points);
  const top = sels.slice(0, 3);
  const cards = await posterCards(top.map((s) => s.playerId));
  return {
    manager: entry.user.displayName,
    clubName: entry.user.clubName,
    competition: entry.competition.name,
    gameweek: entry.competition.gameweek.number,
    live: entry.competition.status === "PROVISIONAL",
    points: Math.round(points * 10) / 10,
    rank: entry.rank ?? ahead + 1,
    entries,
    top: top.flatMap((s) => {
      const card = cards.find((c) => c.playerId === s.playerId);
      return card ? [{ card, points: Math.round(s.points * 10) / 10, captain: !!s.captain }] : [];
    }),
  };
}
