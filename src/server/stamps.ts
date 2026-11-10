import { type StatLine, sumStatLines, toStatLine } from "@/domain/football/scoring";
import { db } from "./db";

/**
 * Card history stamps. After a match settles, each card that counted for its manager is checked
 * against what the player actually did, and stamped for the big moments. Stamps are permanent and
 * belong to that copy of the card — they travel with it if it's traded.
 */
export const STAMPS = {
  HAT_TRICK: { label: "Hat-trick", icon: "⚽⚽⚽" },
  BRACE: { label: "Brace", icon: "⚽⚽" },
  PLAYMAKER: { label: "Playmaker", icon: "🅰" },
  CLEAN_SHEET: { label: "Clean sheet", icon: "🧤" },
  PEN_SAVE: { label: "Penalty save", icon: "✋" },
  CAPTAIN_HAUL: { label: "Captain's haul", icon: "©" },
  BIG_HAUL: { label: "Big haul", icon: "🔥" },
  MATCH_WINNER: { label: "Match winner", icon: "🏆" },
} as const;
export type StampKind = keyof typeof STAMPS;

/** Which stamps a performance earns. Pure, so it's easy to test and to tune. */
export function stampsFor(p: { line: StatLine; position: string; points: number; captain: boolean; won: boolean }): StampKind[] {
  const out: StampKind[] = [];
  if (p.line.goals >= 3) out.push("HAT_TRICK");
  else if (p.line.goals === 2) out.push("BRACE");
  if (p.line.assists >= 2) out.push("PLAYMAKER");
  if ((p.position === "GK" || p.position === "DEF") && p.line.minutes >= 60 && p.line.goalsConceded === 0) out.push("CLEAN_SHEET");
  if (p.line.penaltySaves > 0) out.push("PEN_SAVE");
  if (p.captain && p.points >= 15) out.push("CAPTAIN_HAUL");
  else if (p.points >= 15) out.push("BIG_HAUL");
  if (p.won && p.line.minutes > 0) out.push("MATCH_WINNER");
  return out;
}

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
  if (!cardIds.length) return new Map<string, number>();
  const rows = await db.cardStamp.groupBy({ by: ["cardId"], where: { cardId: { in: cardIds } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.cardId, r._count._all]));
}

