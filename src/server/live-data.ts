import type { Prisma } from "@/generated/prisma/client";
import {
  API_FOOTBALL_LEAGUES,
  API_FOOTBALL_NAME,
  type AfFixture,
  type AfTeam,
  apiFootballConfigured,
  apiFootballGet,
  apiFootballProvider,
  matchPlayer,
  messagesForFixture,
  nameKey,
} from "@/providers/football/api-football";
import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";
import { footballSport, insertGameweek, lockGameweek, refreshProvisional } from "./gameweeks";
import { ingestMessages } from "./ingestion";

/**
 * Live football data from API-Football. Nothing here runs until API_FOOTBALL_KEY is set.
 *
 * Set-up, once per season (Admin → Matches → Live data):
 *   1. Link clubs   — match our clubs to the provider's teams for each league.
 *   2. Link players — match each club's squad by name; anyone unmatched is listed to fix by hand.
 * Then each week:
 *   3. Create the gameweek from real fixtures between two dates.
 *   4. The scheduled job polls live fixtures and scores them exactly like the simulator did.
 */
export function liveDataReady() {
  return apiFootballConfigured();
}

function requireKey() {
  if (!apiFootballConfigured()) throw new DomainError("NO_PROVIDER", "Add API_FOOTBALL_KEY to the server's environment to use live data.");
}

const refOf = (refs: Prisma.JsonValue) => ((refs ?? {}) as Record<string, string>)[API_FOOTBALL_NAME] ?? null;
const withRef = (refs: Prisma.JsonValue, id: string | number) => ({ ...((refs ?? {}) as Record<string, string>), [API_FOOTBALL_NAME]: String(id) }) as Prisma.InputJsonValue;

/** The football season a date falls in, as API-Football numbers it (the starting year). */
export function seasonYear(season: string) {
  return Number(season.slice(0, 4));
}

const clubKey = (s: string) =>
  nameKey(s)
    .replace(/\b(fc|afc|a f c|f c|football club|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Step 1: link our clubs to the provider's teams, league by league. */
export async function linkClubs(season: string, actorId: string | null) {
  requireKey();
  const year = seasonYear(season);
  const leagues = await db.league.findMany({ include: { clubs: true } });
  const report: Array<{ league: string; linked: number; unmatched: string[] }> = [];
  for (const league of leagues) {
    const afId = API_FOOTBALL_LEAGUES[league.code];
    if (!afId) continue;
    const teams = (await apiFootballGet<{ team: AfTeam }>("/teams", { league: afId, season: year })).map((r) => r.team);
    let linked = 0;
    const unmatched: string[] = [];
    for (const club of league.clubs) {
      const keys = [clubKey(club.name), clubKey(club.shortName)];
      const team =
        teams.find((t) => keys.includes(clubKey(t.name))) ??
        teams.find((t) => keys.some((k) => clubKey(t.name).startsWith(k) || k.startsWith(clubKey(t.name))));
      if (!team) {
        unmatched.push(club.name);
        continue;
      }
      await db.club.update({ where: { id: club.id }, data: { providerRefs: withRef(club.providerRefs, team.id) } });
      linked++;
    }
    report.push({ league: league.name, linked, unmatched });
  }
  await audit(db, { actorId, action: "live.linkClubs", entityType: "League", entityId: "all", after: report });
  return report;
}

/** Step 2: link players to the provider's squad lists, by name within each linked club. */
export async function linkPlayers(actorId: string | null, onlyClubIds?: string[]) {
  requireKey();
  const clubs = await db.club.findMany({ where: onlyClubIds ? { id: { in: onlyClubIds } } : {}, include: { players: { where: { active: true } } } });
  let linked = 0;
  const unmatched: Array<{ club: string; provider: string[] }> = [];
  for (const club of clubs) {
    const teamId = refOf(club.providerRefs);
    if (!teamId) continue;
    const [squad] = await apiFootballGet<{ players: Array<{ id: number; name: string }> }>("/players/squads", { team: teamId });
    const missing: string[] = [];
    for (const p of squad?.players ?? []) {
      const ours = matchPlayer(p.name, club.players);
      if (!ours) {
        missing.push(p.name);
        continue;
      }
      if (refOf(ours.providerRefs) !== String(p.id)) await db.player.update({ where: { id: ours.id }, data: { providerRefs: withRef(ours.providerRefs, p.id) } });
      linked++;
    }
    if (missing.length) unmatched.push({ club: club.name, provider: missing });
  }
  await audit(db, { actorId, action: "live.linkPlayers", entityType: "Club", entityId: "all", after: { linked, unmatched: unmatched.length } });
  return { linked, unmatched };
}

/** Link one player by hand (from the unmatched list). */
export async function setPlayerProviderId(playerId: string, providerId: string, actorId: string | null) {
  const p = await db.player.findUniqueOrThrow({ where: { id: playerId } });
  await db.player.update({ where: { id: playerId }, data: { providerRefs: withRef(p.providerRefs, providerId.trim()) } });
  await audit(db, { actorId, action: "live.linkPlayer", entityType: "Player", entityId: playerId, after: { providerId } });
}

/** Coverage: how much of the catalogue is linked. */
export async function liveCoverage() {
  const [row] = await db.$queryRaw<Array<{ clubs: bigint; linked_clubs: bigint; players: bigint; linked_players: bigint }>>`
    SELECT (SELECT count(*) FROM "Club") AS clubs,
           (SELECT count(*) FROM "Club" WHERE "providerRefs" ? ${API_FOOTBALL_NAME}) AS linked_clubs,
           (SELECT count(*) FROM "Player" WHERE active) AS players,
           (SELECT count(*) FROM "Player" WHERE active AND "providerRefs" ? ${API_FOOTBALL_NAME}) AS linked_players`;
  return { configured: liveDataReady(), clubs: Number(row.clubs), linkedClubs: Number(row.linked_clubs), players: Number(row.players), linkedPlayers: Number(row.linked_players) };
}

/** Players at linked clubs who aren't linked themselves, most valuable first. */
export async function unlinkedPlayers(take = 40) {
  return db.$queryRaw<Array<{ id: string; displayName: string; club: string }>>`
    SELECT p.id, p."displayName", c.name AS club FROM "Player" p JOIN "Club" c ON c.id = p."clubId"
    WHERE p.active AND c."providerRefs" ? ${API_FOOTBALL_NAME} AND NOT (p."providerRefs" ? ${API_FOOTBALL_NAME})
    ORDER BY p."marketValueGbp" DESC NULLS LAST LIMIT ${take}`;
}

/** Step 3: create a gameweek from every real fixture in our leagues between two dates. */
export async function createLiveGameweek(args: { season: string; number: number; from: string; to: string; opensAt: Date; actorId: string | null }) {
  requireKey();
  const year = seasonYear(args.season);
  const clubs = await db.club.findMany({ select: { id: true, providerRefs: true } });
  const clubByTeam = new Map(clubs.flatMap((c) => (refOf(c.providerRefs) ? [[refOf(c.providerRefs)!, c.id] as const] : [])));
  const fixtures: Array<{ providerFixtureId: string; homeClubId: string; awayClubId: string; kickoffAt: Date }> = [];
  for (const afId of Object.values(API_FOOTBALL_LEAGUES)) {
    const rows = await apiFootballGet<AfFixture>("/fixtures", { league: afId, season: year, from: args.from, to: args.to });
    for (const f of rows) {
      const home = clubByTeam.get(String(f.teams.home.id));
      const away = clubByTeam.get(String(f.teams.away.id));
      if (!home || !away) continue; // a club we don't carry (e.g. a cup tie)
      fixtures.push({ providerFixtureId: String(f.fixture.id), homeClubId: home, awayClubId: away, kickoffAt: new Date(f.fixture.date) });
    }
  }
  return insertGameweek({ season: args.season, number: args.number, opensAt: args.opensAt, actorId: args.actorId, provider: API_FOOTBALL_NAME, fixtures });
}

/** Step 4: poll every live-data fixture that has kicked off and isn't final yet, then rescore. */
export async function syncLiveGameweek(gameweekId: string, actorId: string | null = null) {
  requireKey();
  const gw = await db.gameweek.findUniqueOrThrow({ where: { id: gameweekId } });
  const due = await db.fixture.findMany({
    where: { gameweekId, provider: API_FOOTBALL_NAME, finalisedAt: null, kickoffAt: { lte: new Date() } },
    select: { providerFixtureId: true },
  });
  if (!due.length) return { fixtures: 0, received: 0, applied: 0, duplicates: 0, stale: 0, unknown: 0 };
  if (gw.status === "OPEN" || gw.status === "UPCOMING") await lockGameweek(gameweekId, actorId);
  const messages = [];
  for (let i = 0; i < due.length; i += 20) {
    const ids = due.slice(i, i + 20).map((f) => f.providerFixtureId).join("-");
    const rows = await apiFootballGet<AfFixture>("/fixtures", { ids });
    for (const f of rows) messages.push(...messagesForFixture(f));
  }
  const report = await ingestMessages(apiFootballProvider, messages);
  if (gw.status !== "SETTLED") await db.gameweek.update({ where: { id: gameweekId }, data: { status: "PROVISIONAL" } });
  await refreshProvisional(gameweekId);
  return { fixtures: due.length, ...report };
}

/** Scheduled job: sync every unsettled live-data gameweek. */
export async function syncLiveData() {
  if (!liveDataReady()) return [];
  const sport = await footballSport();
  const gws = await db.gameweek.findMany({ where: { sportId: sport.id, status: { not: "SETTLED" }, fixtures: { some: { provider: API_FOOTBALL_NAME } } } });
  const out = [];
  for (const gw of gws) out.push({ gameweek: gw.number, ...(await syncLiveGameweek(gw.id)) });
  return out;
}
