import { sumStatLines, toStatLine } from "@/domain/football/scoring";
import { STAMPS, stampsFor } from "@/domain/football/stamps";
export { STAMPS, type StampKind, stampsFor } from "@/domain/football/stamps";
import { db } from "./db";

/**
 * Card history stamps. After a match settles, each card that counted for its manager is checked
 * against what the player actually did, and stamped for the big moments. Stamps are permanent and
 * belong to that copy of the card — they travel with it if it's traded.
 */
/** Stamp every counted card in a settled competition. Idempotent: safe to run again. */
export async function stampCompetition(competitionId: string) {
  const comp = await db.competition.findUniqueOrThrow({ where: { id: competitionId }, include: { gameweek: true } });
  if (comp.status !== "SETTLED") return 0;
  const counted = await db.cardPoints.findMany({
    where: { entry: { competitionId } },
    include: {
      entry: { select: { rank: true, userId: true, user: { select: { displayName: true, clubName: true } }, selections: { select: { cardId: true, position: true, isCaptain: true } } } },
      player: { select: { clubId: true } },
    },
  });
  if (!counted.length) return 0;
  const stats = await db.playerMatchStat.findMany({
    where: { isCurrent: true, playerId: { in: [...new Set(counted.map((c) => c.playerId))] }, fixture: { gameweekId: comp.gameweekId } },
    include: { fixture: { include: { homeClub: { select: { id: true, shortName: true, name: true } }, awayClub: { select: { id: true, shortName: true, name: true } } } } },
  });
  const rows: Array<{ cardId: string; userId: string; kind: string; label: string; detail: string; gameweek: number; competitionId: string; points: number }> = [];
  for (const c of counted) {
    const mine = stats.filter((s) => s.playerId === c.playerId);
    if (!mine.length) continue;
    const line = sumStatLines(mine.map((s) => toStatLine(s.stats)));
    const sel = c.entry.selections.find((s) => s.cardId === c.cardId);
    const f = mine[0].fixture;
    const opponent = f.homeClub.id === c.player.clubId ? f.awayClub.name : f.homeClub.name;
    const squad = c.entry.user.clubName ?? c.entry.user.displayName;
    for (const kind of stampsFor({ line, position: sel?.position ?? "MID", points: c.points, captain: !!sel?.isCaptain, won: c.entry.rank === 1 })) {
      const what = kind === "HAT_TRICK" || kind === "BRACE" ? `${STAMPS[kind].label} (${line.goals} goals)` : kind === "PLAYMAKER" ? `${line.assists} assists` : kind === "MATCH_WINNER" ? `Won ${comp.name}` : kind === "CAPTAIN_HAUL" || kind === "BIG_HAUL" ? `${STAMPS[kind].label}: ${c.points} pts` : STAMPS[kind].label;
      rows.push({
        cardId: c.cardId,
        userId: c.entry.userId,
        kind,
        label: STAMPS[kind].label,
        detail: `${what} vs ${opponent} · GW${comp.gameweek.number} · in ${squad}'s squad`,
        gameweek: comp.gameweek.number,
        competitionId,
        points: c.points,
      });
    }
  }
  const made = await db.cardStamp.createMany({ data: rows, skipDuplicates: true });
  return made.count;
}

/** Stamps on a card, newest first. */
export async function stampsForCard(cardId: string) {
  return db.cardStamp.findMany({ where: { cardId }, orderBy: { createdAt: "desc" } });
}

/** How many stamps each card has (for badges on card faces). */
export async function stampCounts(cardIds: string[]) {
  // Preview faces (e.g. pick options) aren't real cards and have no stamps.
  const ids = cardIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) return new Map<string, number>();
  const rows = await db.cardStamp.groupBy({ by: ["cardId"], where: { cardId: { in: ids } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.cardId, r._count._all]));
}

