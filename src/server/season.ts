import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";

/**
 * Season rollover (admin). The order that works:
 *   1. Settle the last gameweek of the season.
 *   2. Move promoted/relegated clubs and transferred players (cards follow the player).
 *   3. Re-tier players from their new values (Admin → Player values).
 *   4. Start the new season: the old one's standings are frozen in the Hall of Fame and gameweek
 *      numbering starts again at 1.
 *   5. Re-link clubs and players for live data (Admin → Live match data).
 * Cards, collections, levels and trophies all carry over.
 */
const KEY = "season.current";

export async function currentSeason() {
  const row = await db.appSetting.findUnique({ where: { key: KEY } });
  if (typeof row?.value === "string") return row.value;
  const last = await db.gameweek.findFirst({ orderBy: [{ season: "desc" }, { number: "desc" }], select: { season: true } });
  return last?.season ?? "2026-27";
}

/** Next gameweek number in the current season (1 after a rollover). */
export async function nextGameweekNumber(season: string) {
  const last = await db.gameweek.findFirst({ where: { season }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

/** Season table: each manager's best score per gameweek, added up; match wins as a tie-break. */
export async function seasonStandings(season: string, take = 50) {
  const rows = await db.$queryRaw<Array<{ userId: string; displayName: string; clubName: string | null; points: number; wins: bigint; gameweeks: bigint }>>`
    WITH best AS (
      SELECT e."userId", c."gameweekId", MAX(e."finalPoints") AS pts, BOOL_OR(e.rank = 1) AS won
      FROM "CompetitionEntry" e JOIN "Competition" c ON c.id = e."competitionId" JOIN "Gameweek" g ON g.id = c."gameweekId"
      WHERE g.season = ${season} AND c.status = 'SETTLED' AND e."finalPoints" IS NOT NULL
      GROUP BY e."userId", c."gameweekId")
    SELECT b."userId", u."displayName", u."clubName", SUM(b.pts)::float AS points, COUNT(*) FILTER (WHERE b.won) AS wins, COUNT(*) AS gameweeks
    FROM best b JOIN "User" u ON u.id = b."userId"
    GROUP BY b."userId", u."displayName", u."clubName"
    ORDER BY points DESC, wins DESC LIMIT ${take}`;
  return rows.map((r) => ({ ...r, wins: Number(r.wins), gameweeks: Number(r.gameweeks) }));
}

export async function startSeason(adminId: string, season: string) {
  if (!/^\d{4}-\d{2}$/.test(season)) throw new DomainError("BAD_INPUT", "Season looks like 2027-28.");
  const old = await currentSeason();
  if (season <= old) throw new DomainError("BAD_INPUT", `The new season must come after ${old}.`);
  const unsettled = await db.gameweek.count({ where: { season: old, status: { not: "SETTLED" } } });
  if (unsettled) throw new DomainError("UNSETTLED", `${unsettled} gameweek(s) of ${old} aren't settled yet. Finalise them first.`);
  const standings = await seasonStandings(old);
  await db.$transaction([
    db.seasonArchive.upsert({ where: { season: old }, create: { season: old, standings, champion: standings[0]?.displayName ?? null }, update: { standings, champion: standings[0]?.displayName ?? null } }),
    db.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: season, updatedBy: adminId }, update: { value: season, updatedBy: adminId } }),
  ]);
  await audit(db, { actorId: adminId, action: "season.start", entityType: "Season", entityId: season, before: { season: old }, after: { season, archived: standings.length } });
  return { archived: old, champion: standings[0]?.displayName ?? null };
}

/** Promotion / relegation: move a club to another league. */
export async function moveClub(adminId: string, clubCode: string, leagueCode: string) {
  const [club, league] = await Promise.all([db.club.findUnique({ where: { code: clubCode }, include: { league: true } }), db.league.findUnique({ where: { code: leagueCode } })]);
  if (!club || !league) throw new DomainError("NOT_FOUND", "Club or league not found.");
  if (club.leagueId === league.id) return club;
  await db.club.update({ where: { id: club.id }, data: { leagueId: league.id } });
  await audit(db, { actorId: adminId, action: "club.move", entityType: "Club", entityId: club.id, before: { league: club.league.code }, after: { league: league.code } });
  return club;
}

/** A transfer: the player joins another club (or leaves our leagues). Every card of theirs follows them. */
export async function movePlayer(adminId: string, playerId: string, clubCode: string | null) {
  const player = await db.player.findUniqueOrThrow({ where: { id: playerId }, include: { club: true } });
  const club = clubCode ? await db.club.findUnique({ where: { code: clubCode } }) : null;
  if (clubCode && !club) throw new DomainError("NOT_FOUND", "Club not found.");
  await db.player.update({ where: { id: playerId }, data: club ? { clubId: club.id, active: true } : { active: false } });
  await audit(db, { actorId: adminId, action: "player.move", entityType: "Player", entityId: playerId, before: { club: player.club?.code ?? null }, after: { club: club?.code ?? null, left: !club } });
}

export const seasonArchives = () => db.seasonArchive.findMany({ orderBy: { season: "desc" } });
