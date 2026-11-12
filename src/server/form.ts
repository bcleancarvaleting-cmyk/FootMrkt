import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer, toStatLine } from "@/domain/football/scoring";
import { db } from "./db";

/** Points per gameweek for each player over their last N gameweeks with data (scouting/form). */
export async function recentForm(playerIds: string[], gameweeks = 3) {
  const out = new Map<string, number[]>();
  if (!playerIds.length) return out;
  const gws = await db.gameweek.findMany({
    where: { simulated: false, status: { in: ["PROVISIONAL", "SETTLED"] } },
    orderBy: [{ season: "desc" }, { number: "desc" }],
    take: gameweeks,
  });
  const stats = await db.playerMatchStat.findMany({
    where: { isCurrent: true, playerId: { in: playerIds }, fixture: { gameweekId: { in: gws.map((g) => g.id) } } },
    include: { fixture: { select: { gameweekId: true } }, player: { select: { position: true } } },
  });
  const rules = getScoringRules(CURRENT_SCORING_RULES);
  for (const pid of playerIds) {
    const mine = stats.filter((s) => s.playerId === pid);
    if (!mine.length) continue;
    const pos = mine[0].player.position;
    out.set(
      pid,
      gws
        .map((g) => mine.filter((s) => s.fixture.gameweekId === g.id).map((s) => toStatLine(s.stats)))
        .filter((lines) => lines.length)
        .map((lines) => scorePlayer(rules, pos, lines).points),
    );
  }
  return out;
}
