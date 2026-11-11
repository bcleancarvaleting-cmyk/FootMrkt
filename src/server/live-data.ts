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
import { FIXTURE_INCLUDES, SPORTMONKS_LEAGUES, SPORTMONKS_NAME, type SmFixture, smGet, smGetOne, toSharedFixture } from "@/providers/football/sportmonks";
import { currentProvider, hasSportmonksToken, loadIntegrationState } from "./integrations";
import type { FootballDataProvider } from "@/providers/football/types";
import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";
import { footballSport, insertGameweek, lockGameweek, refreshProvisional } from "./gameweeks";
import { ingestMessages } from "./ingestion";

/**
 * Live football data. Sportmonks when DATA_PROVIDER=sportmonks (the launch choice), otherwise
 * API-Football when API_FOOTBALL_KEY is set. Nothing here runs until one is configured.
 *
 * Set-up, once per season (Admin → Live match data):
 *   1. Link clubs   — match our clubs to the provider's teams for each league.
 *   2. Link players — match each club's squad by name; anyone unmatched is listed to fix by hand.
 *      (A squad imported from Sportmonks is linked already.)
 * Then each week:
 *   3. Create the gameweek from real fixtures between two dates.
 *   4. The scheduled job polls live fixtures and scores them exactly like the simulator did.
 */
interface LiveSource {
  name: string;
  label: string;
  configured(): boolean;
  provider: FootballDataProvider;
  leagues: Record<string, number>;
  teams(leagueId: number, season: string): Promise<Array<{ id: string; name: string }>>;
  squad(teamId: string, season: string, leagueId?: number): Promise<Array<{ id: string; name: string }>>;
  fixturesBetween(leagueId: number, season: string, from: string, to: string): Promise<Array<{ id: string; date: string; home: string; away: string }>>;
  fullFixtures(ids: string[]): Promise<AfFixture[]>;
  batch: number;
}

const apiFootballSource: LiveSource = {
  name: API_FOOTBALL_NAME,
  label: "API-Football",
  configured: apiFootballConfigured,
  provider: apiFootballProvider,
  leagues: API_FOOTBALL_LEAGUES,
  async teams(leagueId, season) {
    return (await apiFootballGet<{ team: AfTeam }>("/teams", { league: leagueId, season: seasonYear(season) })).map((r) => ({ id: String(r.team.id), name: r.team.name }));
  },
  async squad(teamId) {
    const [squad] = await apiFootballGet<{ players: Array<{ id: number; name: string }> }>("/players/squads", { team: teamId });
    return (squad?.players ?? []).map((p) => ({ id: String(p.id), name: p.name }));
  },
  async fixturesBetween(leagueId, season, from, to) {
    const rows = await apiFootballGet<AfFixture>("/fixtures", { league: leagueId, season: seasonYear(season), from, to });
    return rows.map((f) => ({ id: String(f.fixture.id), date: f.fixture.date, home: String(f.teams.home.id), away: String(f.teams.away.id) }));
  },
  async fullFixtures(ids) {
    return apiFootballGet<AfFixture>("/fixtures", { ids: ids.join("-") });
  },
  batch: 20,
};

/** Sportmonks' id for a league's current season (cached per process). */
const seasonIds = new Map<number, number>();
export async function sportmonksSeasonId(leagueId: number) {
  if (seasonIds.has(leagueId)) return seasonIds.get(leagueId)!;
  const league = await smGetOne<{ currentseason?: { id: number }; currentSeason?: { id: number }; current_season?: { id: number } }>(`/leagues/${leagueId}`, { include: "currentSeason" });
  const id = league?.currentseason?.id ?? league?.currentSeason?.id ?? league?.current_season?.id;
  if (!id) throw new DomainError("NO_SEASON", `Sportmonks has no current season for league ${leagueId}.`);
  seasonIds.set(leagueId, id);
  return id;
}

const sportmonksSource: LiveSource = {
  name: SPORTMONKS_NAME,
  label: "Sportmonks",
  configured: hasSportmonksToken,
  provider: { ...apiFootballProvider, name: SPORTMONKS_NAME },
  leagues: SPORTMONKS_LEAGUES,
  async teams(leagueId) {
    const rows = await smGet<{ id: number; name: string }>(`/teams/seasons/${await sportmonksSeasonId(leagueId)}`);
    return rows.map((t) => ({ id: String(t.id), name: t.name }));
  },
  async squad(teamId, _season, leagueId) {
    const path = leagueId ? `/squads/seasons/${await sportmonksSeasonId(leagueId)}/teams/${teamId}` : `/squads/teams/${teamId}`;
    const rows = await smGet<{ player_id: number; player?: { display_name?: string; common_name?: string; name?: string } }>(path, { include: "player" });
    return rows.map((r) => ({ id: String(r.player_id), name: r.player?.display_name ?? r.player?.common_name ?? r.player?.name ?? String(r.player_id) }));
  },
  async fixturesBetween(leagueId, _season, from, to) {
    const rows = await smGet<SmFixture>(`/fixtures/between/${from}/${to}`, { include: "participants", filters: `fixtureLeagues:${leagueId}` });
    return rows.map((f) => {
      const s = toSharedFixture(f);
      return { id: String(f.id), date: s.fixture.date, home: String(s.teams.home.id), away: String(s.teams.away.id) };
    });
  },
  async fullFixtures(ids) {
    return (await smGet<SmFixture>(`/fixtures/multi/${ids.join(",")}`, { include: FIXTURE_INCLUDES })).map(toSharedFixture);
  },
  batch: 25,
};

/** The provider in use: Sportmonks if switched on, else API-Football if its key is set. */
export function liveSource(): LiveSource {
  return currentProvider() === SPORTMONKS_NAME || (hasSportmonksToken() && !apiFootballConfigured()) ? sportmonksSource : apiFootballSource;
}

export function liveDataReady() {
  return liveSource().configured();
}

async function requireKey() {
  await loadIntegrationState();
  const src = liveSource();
  if (!src.configured()) throw new DomainError("NO_PROVIDER", "Connect a football data provider first: add the Sportmonks API token in Admin → Integrations, or set API_FOOTBALL_KEY.");
  return src;
}

const refOf = (refs: Prisma.JsonValue, name = liveSource().name) => ((refs ?? {}) as Record<string, string>)[name] ?? null;
const withRef = (refs: Prisma.JsonValue, id: string | number, name = liveSource().name) => ({ ...((refs ?? {}) as Record<string, string>), [name]: String(id) }) as Prisma.InputJsonValue;

/** The football season's starting year (API-Football numbers seasons this way). */
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
  const src = await requireKey();
  const leagues = await db.league.findMany({ include: { clubs: true } });
  const report: Array<{ league: string; linked: number; unmatched: string[] }> = [];
  for (const league of leagues) {
    const leagueId = src.leagues[league.code];
    if (!leagueId) continue;
    const teams = await src.teams(leagueId, season);
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
  const src = await requireKey();
  const clubs = await db.club.findMany({ where: onlyClubIds ? { id: { in: onlyClubIds } } : {}, include: { league: true, players: { where: { active: true } } } });
  let linked = 0;
  const unmatched: Array<{ club: string; provider: string[] }> = [];
  for (const club of clubs) {
    const teamId = refOf(club.providerRefs);
    if (!teamId) continue;
    const squad = await src.squad(teamId, "", src.leagues[club.league.code]);
    const missing: string[] = [];
    for (const p of squad) {
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
  await loadIntegrationState();
  const name = liveSource().name;
  const [row] = await db.$queryRaw<Array<{ clubs: bigint; linked_clubs: bigint; players: bigint; linked_players: bigint }>>`
    SELECT (SELECT count(*) FROM "Club") AS clubs,
           (SELECT count(*) FROM "Club" WHERE "providerRefs" ? ${name}) AS linked_clubs,
           (SELECT count(*) FROM "Player" WHERE active) AS players,
           (SELECT count(*) FROM "Player" WHERE active AND "providerRefs" ? ${name}) AS linked_players`;
  return { provider: liveSource().label, configured: liveDataReady(), clubs: Number(row.clubs), linkedClubs: Number(row.linked_clubs), players: Number(row.players), linkedPlayers: Number(row.linked_players) };
}

/** Players at linked clubs who aren't linked themselves, most valuable first. */
export async function unlinkedPlayers(take = 40) {
  const name = liveSource().name;
  return db.$queryRaw<Array<{ id: string; displayName: string; club: string }>>`
    SELECT p.id, p."displayName", c.name AS club FROM "Player" p JOIN "Club" c ON c.id = p."clubId"
    WHERE p.active AND c."providerRefs" ? ${name} AND NOT (p."providerRefs" ? ${name})
    ORDER BY p."marketValueGbp" DESC NULLS LAST LIMIT ${take}`;
}

/** Step 3: create a gameweek from every real fixture in our leagues between two dates. */
export async function createLiveGameweek(args: { season: string; number: number; from: string; to: string; opensAt: Date; actorId: string | null }) {
  const src = await requireKey();
  const clubs = await db.club.findMany({ select: { id: true, providerRefs: true } });
  const clubByTeam = new Map(clubs.flatMap((c) => (refOf(c.providerRefs) ? [[refOf(c.providerRefs)!, c.id] as const] : [])));
  const fixtures: Array<{ providerFixtureId: string; homeClubId: string; awayClubId: string; kickoffAt: Date }> = [];
  for (const leagueId of Object.values(src.leagues)) {
    for (const f of await src.fixturesBetween(leagueId, args.season, args.from, args.to)) {
      const home = clubByTeam.get(f.home);
      const away = clubByTeam.get(f.away);
      if (!home || !away) continue; // a club we don't carry (e.g. a cup tie)
      fixtures.push({ providerFixtureId: f.id, homeClubId: home, awayClubId: away, kickoffAt: new Date(f.date) });
    }
  }
  return insertGameweek({ season: args.season, number: args.number, opensAt: args.opensAt, actorId: args.actorId, provider: src.name, fixtures });
}

/** Step 4: poll every live-data fixture that has kicked off and isn't final yet, then rescore. */
export async function syncLiveGameweek(gameweekId: string, actorId: string | null = null) {
  const src = await requireKey();
  const gw = await db.gameweek.findUniqueOrThrow({ where: { id: gameweekId } });
  const due = await db.fixture.findMany({
    where: { gameweekId, provider: src.name, finalisedAt: null, kickoffAt: { lte: new Date() } },
    select: { providerFixtureId: true },
  });
  if (!due.length) return { fixtures: 0, received: 0, applied: 0, duplicates: 0, stale: 0, unknown: 0 };
  if (gw.status === "OPEN" || gw.status === "UPCOMING") await lockGameweek(gameweekId, actorId);
  const messages = [];
  for (let i = 0; i < due.length; i += src.batch) {
    const rows = await src.fullFixtures(due.slice(i, i + src.batch).map((f) => f.providerFixtureId));
    for (const f of rows) messages.push(...messagesForFixture(f));
  }
  const report = await ingestMessages(src.provider, messages);
  if (gw.status !== "SETTLED") await db.gameweek.update({ where: { id: gameweekId }, data: { status: "PROVISIONAL" } });
  await refreshProvisional(gameweekId);
  return { fixtures: due.length, ...report };
}

/** Scheduled job: sync every unsettled live-data gameweek. */
export async function syncLiveData() {
  await loadIntegrationState();
  if (!liveDataReady()) return [];
  const sport = await footballSport();
  const gws = await db.gameweek.findMany({ where: { sportId: sport.id, status: { not: "SETTLED" }, fixtures: { some: { provider: liveSource().name } } } });
  const out = [];
  for (const gw of gws) out.push({ gameweek: gw.number, ...(await syncLiveGameweek(gw.id)) });
  return out;
}

/**
 * Launch history (product decision 11 Nov 2026): import the last HISTORY_WEEKS weeks with matches
 * (Friday-to-Thursday, so international breaks are skipped) as settled gameweeks, so player form,
 * values and tiers start from real results. Matches not yet played in the current week are left
 * out; the following week opens for entries. About 8 API calls.
 */
export const HISTORY_WEEKS = 4;
export async function importSeasonToDate(season: string, now = new Date(), weeksBack = HISTORY_WEEKS) {
  const src = await requireKey();
  const { finaliseGameweek } = await import("./gameweeks");
  const DAY = 86_400_000;
  const clubs = await db.club.findMany({ select: { id: true, providerRefs: true } });
  const clubByTeam = new Map(clubs.flatMap((c) => (refOf(c.providerRefs, src.name) ? [[refOf(c.providerRefs, src.name)!, c.id] as const] : [])));
  if (!clubByTeam.size) throw new DomainError("NOT_LINKED", "No clubs are linked to the data provider yet.");

  // League fixtures from far enough back to find the last few match weeks (allowing for an
  // international break or two), to a fortnight ahead, in ≤ 90-day chunks.
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(Math.max(Date.UTC(seasonYear(season), 6, 1), now.getTime() - (weeksBack + 3) * 7 * DAY));
  const end = new Date(now.getTime() + 14 * DAY);
  const all: Array<{ id: string; at: Date; home: string; away: string }> = [];
  for (const leagueId of Object.values(src.leagues)) {
    for (let from = start; from < end; from = new Date(from.getTime() + 90 * DAY)) {
      const to = new Date(Math.min(from.getTime() + 89 * DAY, end.getTime()));
      for (const f of await src.fixturesBetween(leagueId, season, iso(from), iso(to))) {
        const home = clubByTeam.get(f.home);
        const away = clubByTeam.get(f.away);
        if (home && away && !all.some((x) => x.id === f.id)) all.push({ id: f.id, at: new Date(f.date), home, away });
      }
    }
  }

  // Friday-to-Thursday weeks.
  const weekStart = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    return new Date(x.getTime() - ((x.getUTCDay() - 5 + 7) % 7) * DAY);
  };
  const playedBefore = new Date(now.getTime() - 4 * 3600_000); // finished by now
  const weeks = new Map<number, typeof all>();
  for (const f of all.filter((x) => x.at < playedBefore)) {
    const k = weekStart(f.at).getTime();
    weeks.set(k, [...(weeks.get(k) ?? []), f]);
  }
  let number = 0;
  let fixtures = 0;
  // Only the most recent weeks that had matches.
  for (const [k, list] of [...weeks].sort((a, b) => a[0] - b[0]).slice(-weeksBack)) {
    number++;
    const gw = await insertGameweek({
      season,
      number,
      opensAt: new Date(k - 3 * DAY),
      actorId: null,
      provider: src.name,
      fixtures: list.map((f) => ({ providerFixtureId: f.id, homeClubId: f.home, awayClubId: f.away, kickoffAt: f.at })),
    });
    await syncLiveGameweek(gw.id);
    // A match the provider still shows as not played (e.g. postponed without a status) is dropped.
    await db.fixture.deleteMany({ where: { gameweekId: gw.id, status: { in: ["SCHEDULED", "LIVE"] } } });
    await finaliseGameweek(gw.id, null, new Date(Math.min(k + 7 * DAY, now.getTime())));
    fixtures += list.length;
  }

  // The next week with matches that haven't started yet opens for entries — skipping international
  // breaks, and including this week if none of its matches has kicked off.
  const future = all.filter((f) => f.at.getTime() > now.getTime() + 3600_000).sort((a, b) => a.at.getTime() - b.at.getTime());
  let upcoming: typeof all = [];
  for (const f of future) {
    const k = weekStart(f.at).getTime();
    const week = all.filter((x) => weekStart(x.at).getTime() === k);
    if (week.every((x) => x.at.getTime() > now.getTime() + 3600_000)) {
      upcoming = week;
      break;
    }
  }
  let openGameweek: number | null = null;
  if (upcoming.length) {
    openGameweek = number + 1;
    await insertGameweek({
      season,
      number: openGameweek,
      opensAt: now,
      actorId: null,
      provider: src.name,
      fixtures: upcoming.map((f) => ({ providerFixtureId: f.id, homeClubId: f.home, awayClubId: f.away, kickoffAt: f.at })),
    });
  }
  return { gameweeks: number, fixtures, openGameweek };
}

/**
 * Nightly transfer check (Sportmonks): read every club's current squad and
 *  - move a player who now appears at another of our clubs (their cards follow them);
 *  - add a new signing we don't have yet, as a Bronze card (re-tiered by the next value update);
 *  - leave alone anyone missing from every squad (injured, loaned abroad…) — they're listed for admin.
 * About 92 API calls. Runs once a day from the scheduled job.
 */
export type SquadSyncReport = {
  at: string;
  by: string | null;
  moved: Array<{ name: string; from: string; to: string }>;
  added: Array<{ name: string; club: string; tier: string }>;
  missing: Array<{ name: string; club: string }>;
  numbers: number;
  failedClubs: string[];
};

/**
 * Squad sync from Sportmonks (nightly, or Admin → Players → "Run squad sync now"):
 *  - a player who has moved between English clubs moves here too — every copy of their card then
 *    shows the new club's name, badge and shirt, because a card always shows its player's club;
 *  - a player new to the English leagues is added with a card design in their tier, so they can be
 *    packed, dropped and valued like everyone else;
 *  - shirt numbers are kept up to date;
 *  - players no longer in any squad (left the English leagues) are listed for an admin to review.
 * The report is saved for the admin page. Safe to run again: it only changes what's different.
 */
export async function syncSquads(actorId: string | null = null) {
  const src = await requireKey();
  if (src.name !== SPORTMONKS_NAME) return { moved: 0, added: 0, missing: 0 };
  const { tierFor, MAX_SUPPLY } = await import("@/config/tiers");
  const { positionOf } = await import("@/providers/football/sportmonks");
  const sport = await footballSport();
  const clubs = await db.club.findMany({ include: { league: true } });
  const clubName = new Map(clubs.map((c) => [c.id, c.name]));
  const players = await db.player.findMany({ where: { active: true }, select: { id: true, clubId: true, providerRefs: true, displayName: true, squadNumber: true } });
  const byRef = new Map(players.flatMap((p) => (refOf(p.providerRefs, src.name) ? [[refOf(p.providerRefs, src.name)!, p] as const] : [])));
  const seen = new Set<string>();
  const report: SquadSyncReport = { at: new Date().toISOString(), by: actorId, moved: [], added: [], missing: [], numbers: 0, failedClubs: [] };
  for (const club of clubs) {
    const teamId = refOf(club.providerRefs, src.name);
    const leagueId = src.leagues[club.league.code];
    if (!teamId || !leagueId) continue;
    let rows: Array<{ player_id: number; jersey_number?: number | null; position_id?: number | null; player?: { display_name?: string; common_name?: string; name?: string; position_id?: number | null } }>;
    try {
      rows = await smGet(`/squads/seasons/${await sportmonksSeasonId(leagueId)}/teams/${teamId}`, { include: "player" });
    } catch {
      report.failedClubs.push(club.name);
      continue;
    }
    for (const r of rows) {
      const ref = String(r.player_id);
      seen.add(ref);
      const ours = byRef.get(ref);
      if (ours) {
        const data: { clubId?: string; squadNumber?: number | null } = {};
        if (ours.clubId !== club.id) data.clubId = club.id;
        if (r.jersey_number != null && r.jersey_number !== ours.squadNumber) data.squadNumber = r.jersey_number;
        if (!Object.keys(data).length) continue;
        await db.player.update({ where: { id: ours.id }, data });
        if (data.clubId) {
          await audit(db, { actorId, action: "player.move", entityType: "Player", entityId: ours.id, before: { clubId: ours.clubId }, after: { clubId: club.id, via: "sportmonks" } });
          const from = (ours.clubId && clubName.get(ours.clubId)) || "—";
          report.moved.push({ name: ours.displayName, from, to: club.name });
          await tellOwnersOfMove(ours.id, ours.displayName, from, club.name, club.id);
          ours.clubId = club.id;
        } else report.numbers++;
        continue;
      }
      const position = positionOf({ position_id: r.position_id ?? r.player?.position_id });
      const name = r.player?.display_name ?? r.player?.common_name ?? r.player?.name;
      if (!position || !name) continue;
      const parts = name.trim().split(/\s+/);
      const player = await db.player.create({
        data: {
          sportId: sport.id,
          clubId: club.id,
          firstName: parts.length > 1 ? parts[0] : "",
          lastName: parts.length > 1 ? parts.slice(1).join(" ") : parts[0],
          displayName: name.length <= 18 || parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(" ")}`,
          position,
          squadNumber: r.jersey_number ?? null,
          nationality: "",
          rightsStatus: "PENDING",
          providerRefs: { [src.name]: ref },
        },
      });
      const category = tierFor(club.league.tier, r.jersey_number ?? null);
      await db.cardTemplate.create({ data: { playerId: player.id, category, maxSupply: MAX_SUPPLY[category] } });
      await audit(db, { actorId, action: "player.add", entityType: "Player", entityId: player.id, after: { name, club: club.code, via: "sportmonks" } });
      report.added.push({ name, club: club.name, tier: category });
    }
  }
  // Only call players "gone" when every squad loaded — a failed download mustn't look like an exodus.
  if (!report.failedClubs.length) {
    for (const [ref, p] of byRef) if (!seen.has(ref)) report.missing.push({ name: p.displayName, club: (p.clubId && clubName.get(p.clubId)) || "—" });
  }
  // New players get a value straight away, so they can be priced in drops and on the market.
  if (report.added.length) {
    const { revalueAll } = await import("./valuation");
    await revalueAll().catch((e) => console.error("revalue after squad sync failed", e));
  }
  await db.appSetting.upsert({ where: { key: "squads.lastSyncAt" }, create: { key: "squads.lastSyncAt", value: Date.now() }, update: { value: Date.now() } });
  const stored = { ...report, missing: report.missing.slice(0, 200), added: report.added.slice(0, 300), moved: report.moved.slice(0, 300) };
  await db.appSetting.upsert({ where: { key: "squads.lastReport" }, create: { key: "squads.lastReport", value: stored }, update: { value: stored } });
  return { moved: report.moved.length, added: report.added.length, missing: report.missing.length };
}

/**
 * A player has moved club: everyone who owns one of their cards is told (in-app, and on their phone
 * if they turned that on). The card itself now plays for the new club; its serial, finish and
 * history stamps stay with it.
 */
async function tellOwnersOfMove(playerId: string, name: string, from: string, to: string, toClubId: string) {
  const owners = await db.cardInstance.findMany({ where: { template: { playerId }, ownerId: { not: null } }, select: { ownerId: true, id: true }, distinct: ["ownerId"] });
  if (!owners.length) return;
  const { notify } = await import("./notifications");
  for (const o of owners) {
    await notify(o.ownerId!, {
      kind: "TRANSFER",
      title: `🔁 ${name} has moved to ${to}`,
      body: `Real-life transfer from ${from}. Your ${name} card now plays for ${to} — same card, same number and history.`,
      href: `/cards/${o.id}`,
      dedupeKey: `move:${playerId}:${toClubId}:${o.ownerId}`,
    }).catch(() => {});
  }
}

/** The last squad sync's report (for the admin page). */
export async function lastSquadSync(): Promise<SquadSyncReport | null> {
  const row = await db.appSetting.findUnique({ where: { key: "squads.lastReport" } });
  return (row?.value as SquadSyncReport | undefined) ?? null;
}

/** Scheduled job: the squad sync, at most once a day. */
export async function dailySquadSync() {
  await loadIntegrationState();
  if (!liveDataReady() || liveSource().name !== SPORTMONKS_NAME) return null;
  const last = await db.appSetting.findUnique({ where: { key: "squads.lastSyncAt" } });
  if (last && Date.now() - Number(last.value) < 20 * 3600_000) return null;
  return syncSquads();
}
