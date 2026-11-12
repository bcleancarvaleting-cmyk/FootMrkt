import { startPriority, XI_SLOTS } from "@/providers/football/simulated";
import { db } from "./db";
import { weights } from "./sim-matchday";

/**
 * "Likely to start" for sim games: each player's chance of being in their club's starting XI,
 * worked out by running the simulator's own team selection (shirt number, form and value, rotation)
 * a few hundred times — plus how often they've actually started in recent sim games.
 */
export interface StartGuide {
  pct: number; // 0–100
  started: number; // recent sim games started
  of: number; // recent sim games played by their club
}

const RUNS = 400;

export async function simStartGuide(playerIds: string[], asOf = new Date()): Promise<Map<string, StartGuide>> {
  const out = new Map<string, StartGuide>();
  if (!playerIds.length) return out;
  const targets = await db.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, clubId: true } });
  const clubIds = [...new Set(targets.map((t) => t.clubId).filter((c): c is string => !!c))];
  if (!clubIds.length) return out;
  const squads = await db.player.findMany({ where: { clubId: { in: clubIds }, active: true }, select: { id: true, clubId: true, position: true, squadNumber: true } });
  const w = await weights(squads.map((p) => p.id), asOf);

  const chance = new Map<string, number>();
  for (const clubId of clubIds) {
    const squad = squads.filter((p) => p.clubId === clubId).map((p) => ({ ...p, weight: w.get(p.id) ?? 1 }));
    const starts = new Map<string, number>();
    for (let r = 0; r < RUNS; r++) {
      for (const [pos, n] of Object.entries(XI_SLOTS)) {
        squad
          .filter((p) => p.position === pos)
          .map((p) => ({ id: p.id, k: startPriority(p, Math.random()) }))
          .sort((a, b) => a.k - b.k)
          .slice(0, n)
          .forEach((x) => starts.set(x.id, (starts.get(x.id) ?? 0) + 1));
      }
    }
    for (const p of squad) chance.set(p.id, Math.round(((starts.get(p.id) ?? 0) / RUNS) * 100));
  }

  // Recent sim games: starters play 55+ minutes, substitutes 35 at most.
  const recent = await db.$queryRaw<Array<{ playerId: string; started: number; of: number }>>`
    WITH club_games AS (
      SELECT p.id AS "playerId", f.id AS "fixtureId",
             ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY f."kickoffAt" DESC) AS rn
      FROM "Player" p
      JOIN "Fixture" f ON (f."homeClubId" = p."clubId" OR f."awayClubId" = p."clubId")
      JOIN "Gameweek" g ON g.id = f."gameweekId"
      WHERE p.id = ANY(${playerIds}::uuid[]) AND g.simulated AND f.status = 'FINISHED'
    )
    SELECT cg."playerId",
           COUNT(*) FILTER (WHERE COALESCE((s.stats->>'minutes')::int, 0) >= 55)::int AS started,
           COUNT(*)::int AS of
    FROM club_games cg
    LEFT JOIN "PlayerMatchStat" s ON s."fixtureId" = cg."fixtureId" AND s."playerId" = cg."playerId" AND s."isCurrent"
    WHERE cg.rn <= 5
    GROUP BY cg."playerId"`;
  for (const id of playerIds) {
    const r = recent.find((x) => x.playerId === id);
    out.set(id, { pct: chance.get(id) ?? 0, started: r?.started ?? 0, of: r?.of ?? 0 });
  }
  return out;
}
