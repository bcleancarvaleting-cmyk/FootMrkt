import { tierForValue } from "@/config/tiers";
import { FORMULA_CAP_GBP, formulaValue, loadNamedEstimates, norm } from "@/domain/valuation/estimates";
import { db } from "./db";
import { applyMarketValues } from "./tiering";

/**
 * MATCHX estimated market values for every player (Nov 2026), used only to tier cards.
 *  - Named estimates in prisma/data/value-estimates.txt (well-known players).
 *  - Everyone else: league level × club strength × squad role, with a small per-player spread.
 * Values from any other source (licensed import, admin paste) are never overwritten.
 */
export { FORMULA_CAP_GBP, formulaValue, loadNamedEstimates };

export const ESTIMATE_SOURCE = "MATCHX estimate (Nov 2026)";

export async function estimateAllValues(actorId: string | null = null, opts: { dryRun?: boolean } = {}) {
  const named = loadNamedEstimates();
  const players = await db.player.findMany({ where: { active: true }, include: { club: { include: { league: true } } } });
  const avg = new Map<string, number>();
  for (const lg of new Set(players.map((p) => p.club?.leagueId).filter(Boolean) as string[])) {
    const clubs = await db.club.findMany({ where: { leagueId: lg }, select: { simStrength: true } });
    avg.set(lg, clubs.reduce((s, c) => s + c.simStrength, 0) / Math.max(1, clubs.length));
  }
  const used = new Set<string>();
  const rows = [];
  const tiers = { GOLD: 0, SILVER: 0, BRONZE: 0 };
  let kept = 0;
  for (const p of players) {
    if (p.marketValueSource && !p.marketValueSource.startsWith("MATCHX estimate")) {
      kept++;
      continue;
    }
    if (!p.club) continue;
    const key = `${p.club.shortName}|${norm(p.lastName)}`;
    const dup = players.filter((q) => q.club?.shortName === p.club!.shortName && norm(q.lastName) === norm(p.lastName)).length > 1;
    const namedValue = !dup ? named.get(key) : undefined;
    if (namedValue !== undefined) used.add(key);
    const valueGbp =
      namedValue ??
      formulaValue({ id: p.id, squadNumber: p.squadNumber, leagueTier: p.club.league.tier, clubStrength: p.club.simStrength, leagueAvgStrength: avg.get(p.club.leagueId) ?? p.club.simStrength });
    tiers[tierForValue(valueGbp)]++;
    rows.push({ playerId: p.id, valueGbp, source: ESTIMATE_SOURCE, at: new Date() });
  }
  const unmatched = [...named.keys()].filter((k) => !used.has(k));
  const result = opts.dryRun ? { updated: 0, retiered: 0 } : await applyMarketValues(rows, actorId);
  return { ...result, players: rows.length, named: used.size, unmatched, keptOtherSources: kept, tiers };
}
