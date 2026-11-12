import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer, toStatLine } from "@/domain/football/scoring";
import { startPriority, XI_SLOTS } from "@/providers/football/simulated";
import { db } from "./db";
import { weights } from "./sim-matchday";

/**
 * Who starts in a sim game: real appearances × form (product decision 13 Nov 2026).
 *
 *   appearances = share of the minutes in their club's last 6 real games (as of kick-off)
 *   form        = average MATCHX points per appearance in those games (6+ a game = top form)
 *   start score = appearances × (0.75 + 0.25 × form)      → 1 = always starts
 *
 * The simulator picks each XI with this score (sims from SELECTION_V2_FROM on), and the "likely to
 * start" guide runs the same selection a few hundred times — so 100% means they will start.
 * Clubs with no real games on record fall back to shirt numbers.
 */
export const SELECTION_V2_FROM = new Date("2026-11-13T00:00:00Z");
const LAST_GAMES = 6;

export interface Appearance {
  score: number;
  apps: number; // games they played in
  games: number; // their club's games counted
  form: number; // avg points per appearance
}

export async function startScores(playerIds: string[], asOf: Date): Promise<Map<string, Appearance>> {
  const out = new Map<string, Appearance>();
  if (!playerIds.length) return out;
  const rows = await db.$queryRaw<Array<{ playerId: string; position: string; fixtureId: string; stats: unknown }>>`
    WITH cf AS (
      SELECT p.id AS "playerId", p.position::text AS position, f.id AS "fixtureId",
             ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY f."kickoffAt" DESC) AS rn
      FROM "Player" p
      JOIN "Fixture" f ON (f."homeClubId" = p."clubId" OR f."awayClubId" = p."clubId")
      JOIN "Gameweek" g ON g.id = f."gameweekId"
      WHERE p.id = ANY(${playerIds}::uuid[]) AND NOT g.simulated AND f.status = 'FINISHED' AND f."kickoffAt" < ${asOf}
    )
    SELECT cf."playerId", cf.position, cf."fixtureId", s.stats
    FROM cf LEFT JOIN "PlayerMatchStat" s ON s."fixtureId" = cf."fixtureId" AND s."playerId" = cf."playerId" AND s."isCurrent"
    WHERE cf.rn <= ${LAST_GAMES}`;
  const rules = getScoringRules(CURRENT_SCORING_RULES);
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(r.playerId, [...(by.get(r.playerId) ?? []), r]);
  for (const [id, games] of by) {
    let mins = 0;
    let apps = 0;
    let pts = 0;
    for (const g of games) {
      if (!g.stats) continue;
      const line = toStatLine(g.stats);
      if (line.minutes <= 0) continue;
      apps++;
      mins += Math.min(90, line.minutes);
      pts += scorePlayer(rules, g.position as "GK", [line]).points;
    }
    const share = mins / (games.length * 90);
    const form = apps ? pts / apps : 0;
    const formNorm = Math.min(1, Math.max(0, form / 6));
    out.set(id, { score: Math.round(share * (0.75 + 0.25 * formNorm) * 1000) / 1000, apps, games: games.length, form: Math.round(form * 10) / 10 });
  }
  return out;
}

export interface StartGuide {
  pct: number; // 0–100
  apps: number;
  games: number;
  form: number;
}

const RUNS = 400;

/** The "likely to start" guide for the given players (their whole club squads are simulated). */
export async function simStartGuide(playerIds: string[], asOf = new Date()): Promise<Map<string, StartGuide>> {
  const out = new Map<string, StartGuide>();
  if (!playerIds.length) return out;
  const targets = await db.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, clubId: true } });
  const clubIds = [...new Set(targets.map((t) => t.clubId).filter((c): c is string => !!c))];
  if (!clubIds.length) return out;
  const squads = await db.player.findMany({ where: { clubId: { in: clubIds }, active: true }, select: { id: true, clubId: true, position: true, squadNumber: true } });
  const [w, scores] = await Promise.all([weights(squads.map((p) => p.id), asOf), startScores(squads.map((p) => p.id), asOf)]);

  const chance = new Map<string, number>();
  for (const clubId of clubIds) {
    const squad = squads.filter((p) => p.clubId === clubId).map((p) => ({ ...p, weight: w.get(p.id) ?? 1, startScore: scores.get(p.id)?.score }));
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
  for (const id of playerIds) {
    const a = scores.get(id);
    out.set(id, { pct: chance.get(id) ?? 0, apps: a?.apps ?? 0, games: a?.games ?? 0, form: a?.form ?? 0 });
  }
  return out;
}
