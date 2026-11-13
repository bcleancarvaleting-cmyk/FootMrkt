import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer, toStatLine } from "@/domain/football/scoring";
import { db } from "./db";
import { notify } from "./notifications";
import { simAt, simPlan } from "./sim-matchday";

/**
 * Matchday live: scores for the scores ticker, and — for a signed-in manager — the live points of
 * the players in their locked squads, plus each entry's provisional points and live rank. Fed by
 * the scheduled live-data sync, so it's as fresh as the last sync.
 */
const HOUR = 3_600_000;

export interface LiveFixture {
  id: string;
  home: { code: string; name: string; colour: string };
  away: { code: string; name: string; colour: string };
  league: string;
  homeGoals: number | null;
  awayGoals: number | null;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  /** Clock while live: the provider's minute, or an estimate from kick-off ("HT" at the break). */
  clock: string | null;
  kickoffAt: string;
  /** Man of the Match, once the game is over. */
  motm: string | null;
  /** A simulated matchday game (results generated from real form). */
  sim: boolean;
  /** Simulated games: the feed so far — goals (with assists), cards, missed penalties — newest first. */
  events: LiveEvent[];
}

export interface LiveEvent {
  minute: number;
  type: "goal" | "own_goal" | "yellow" | "red" | "pen_miss";
  side: "home" | "away";
  player: string;
  assist?: string | null;
  saved?: boolean;
}

export interface LivePlayer {
  playerId: string;
  name: string;
  club: string;
  imageUrl?: string | null;
  colour?: string;
  points: number;
  goals: number;
  assists: number;
  minutes: number;
  live: boolean;
  captain: boolean;
}

export interface LiveEntry {
  competitionId: string;
  name: string;
  points: number;
  rank: number;
  entries: number;
}

export interface LiveBoard {
  fixtures: LiveFixture[];
  liveCount: number;
  mine: { entries: LiveEntry[]; players: LivePlayer[] } | null;
  generatedAt: string;
  /** A quick simulated matchday is on (or about to kick off): refresh every few seconds. */
  fast: boolean;
}

/** Match clock: the provider's minute, else estimated from kick-off (45' + a 15-minute break). */
export function matchClock(status: string, kickoffAt: Date, minute: number | null, now = new Date()) {
  if (status !== "LIVE") return null;
  if (minute != null) return `${minute}'`;
  const m = Math.floor((now.getTime() - kickoffAt.getTime()) / 60_000);
  if (m < 1) return "1'";
  if (m <= 45) return `${m}'`;
  if (m < 60) return "HT";
  return `${Math.min(90, m - 15)}'${m - 15 > 90 ? "+" : ""}`;
}

/** Which games a board shows: real football, simulated matchdays, or both (Matchday Live). */
export type LiveScope = "real" | "sim" | "all";
const scopeWhere = (scope: LiveScope) => (scope === "all" ? {} : { gameweek: { simulated: scope === "sim" } });

async function tickerFixtures(now: Date, scope: LiveScope) {
  const select = {
    id: true,
    status: true,
    homeGoals: true,
    awayGoals: true,
    minute: true,
    motmPlayerId: true,
    kickoffAt: true,
    gameweekId: true,
    simEvents: true,
    gameweek: { select: { simulated: true, simHalfSeconds: true } },
    homeClub: { select: { code: true, name: true, primaryColour: true, league: { select: { code: true } } } },
    awayClub: { select: { code: true, name: true, primaryColour: true } },
  } as const;
  // Today's football: anything live, plus results and kick-offs within the day around now.
  // Live games first, then the next kick-offs and the latest results (a busy sim day can have hundreds).
  const [liveRows, nextRows, recentRows] = await Promise.all([
    db.fixture.findMany({ where: { status: "LIVE", ...scopeWhere(scope) }, orderBy: { kickoffAt: "desc" }, take: 120, select }),
    db.fixture.findMany({ where: { status: { not: "LIVE" }, ...scopeWhere(scope), kickoffAt: { gte: now, lte: new Date(now.getTime() + 14 * HOUR) } }, orderBy: { kickoffAt: "asc" }, take: 60, select }),
    db.fixture.findMany({ where: { status: { not: "LIVE" }, ...scopeWhere(scope), kickoffAt: { gte: new Date(now.getTime() - 14 * HOUR), lt: now } }, orderBy: { kickoffAt: "desc" }, take: 60, select }),
  ]);
  const seen = new Set<string>();
  let rows = [...liveRows, ...nextRows, ...recentRows].filter((r) => !seen.has(r.id) && seen.add(r.id));
  // Simulated games: one simulated matchday only — the one that kicked off most recently, else the next one.
  const sims = rows.filter((r) => r.gameweek.simulated);
  const started = sims.filter((r) => r.kickoffAt <= now).sort((a, b) => b.kickoffAt.getTime() - a.kickoffAt.getTime())[0];
  const next = sims.filter((r) => r.kickoffAt > now).sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime())[0];
  const simGw = (started ?? next)?.gameweekId;
  if (simGw) rows = rows.filter((r) => !r.gameweek.simulated || r.gameweekId === simGw);
  // The sim ticker runs only while the games are being played — no "coming up", no old results.
  if (scope === "sim") rows = rows.filter((r) => r.status === "LIVE");
  rows.sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
  // Quiet day: the latest results instead (never for the sim strip, which only runs during play).
  if (!rows.length && scope !== "sim") {
    rows = (await db.fixture.findMany({ where: { status: "FINISHED", ...scopeWhere(scope), kickoffAt: { gte: new Date(now.getTime() - 4 * 24 * HOUR) } }, orderBy: { kickoffAt: "desc" }, take: 24, select })).reverse();
  }
  const motmIds = rows.map((r) => r.motmPlayerId).filter((x): x is string => !!x);
  const names = new Map((motmIds.length ? await db.player.findMany({ where: { id: { in: motmIds } }, select: { id: true, displayName: true } }) : []).map((p) => [p.id, p.displayName]));
  const quick = rows.some((f) => f.gameweek.simulated && simPlan(f.gameweekId, f.gameweek.simHalfSeconds).half <= 600 && f.status !== "FINISHED" && f.kickoffAt.getTime() - now.getTime() < 3 * 60_000);
  const fixtures = rows.map(
    (f): LiveFixture => ({
      motm: f.motmPlayerId ? (names.get(f.motmPlayerId) ?? null) : null,
      sim: f.gameweek.simulated,
      events: f.gameweek.simulated ? [...((f.simEvents as LiveEvent[] | null) ?? [])].reverse() : [],
      id: f.id,
      home: { code: f.homeClub.code, name: f.homeClub.name, colour: f.homeClub.primaryColour },
      away: { code: f.awayClub.code, name: f.awayClub.name, colour: f.awayClub.primaryColour },
      league: f.homeClub.league.code,
      homeGoals: f.homeGoals,
      awayGoals: f.awayGoals,
      status: f.status === "ABANDONED" ? "POSTPONED" : (f.status as LiveFixture["status"]),
      clock: f.gameweek.simulated ? (f.status === "LIVE" ? simAt(simPlan(f.gameweekId, f.gameweek.simHalfSeconds), f.kickoffAt, now).clock : null) : matchClock(f.status, f.kickoffAt, f.minute, now),
      kickoffAt: f.kickoffAt.toISOString(),
    }),
  );
  return { fixtures, quick };
}

/** The manager's locked entries this gameweek: points, live rank, and each player's live points. */
async function myLive(userId: string, scope: LiveScope) {
  const entries = await db.competitionEntry.findMany({
    where: { userId, status: "ACTIVE", competition: { status: { in: ["LOCKED", "PROVISIONAL"] }, ...scopeWhere(scope) } },
    select: {
      provisionalPoints: true,
      competition: { select: { id: true, name: true, gameweekId: true, _count: { select: { entries: true } } } },
      selections: { select: { playerId: true, isCaptain: true, slot: true, player: { select: { displayName: true, position: true, imageUrl: true, club: { select: { code: true, primaryColour: true } } } } } },
    },
  });
  if (!entries.length) return null;
  const ranks = await Promise.all(
    entries.map((e) =>
      db.competitionEntry.count({ where: { competitionId: e.competition.id, status: "ACTIVE", provisionalPoints: { gt: e.provisionalPoints ?? 0 } } }).then((n) => n + 1),
    ),
  );
  const gwIds = [...new Set(entries.map((e) => e.competition.gameweekId))];
  const picked = new Map<string, { name: string; club: string; position: string; captain: boolean; imageUrl: string | null; colour: string }>();
  for (const e of entries)
    for (const s of e.selections) {
      const prev = picked.get(s.playerId);
      picked.set(s.playerId, { name: s.player.displayName, club: s.player.club?.code ?? "", position: s.player.position, captain: (prev?.captain ?? false) || s.isCaptain, imageUrl: s.player.imageUrl, colour: s.player.club?.primaryColour ?? "#2a2f38" });
    }
  const stats = await db.playerMatchStat.findMany({
    where: { isCurrent: true, playerId: { in: [...picked.keys()] }, fixture: { gameweekId: { in: gwIds } } },
    select: { playerId: true, stats: true, fixture: { select: { status: true } } },
  });
  const rules = getScoringRules(CURRENT_SCORING_RULES);
  const players: LivePlayer[] = [...picked.entries()].map(([playerId, p]) => {
    const mine = stats.filter((s) => s.playerId === playerId);
    const lines = mine.map((s) => toStatLine(s.stats)).filter((l) => l.minutes > 0);
    const points = lines.length ? Math.round(scorePlayer(rules, p.position as "GK", lines).points * 10) / 10 : 0;
    return {
      playerId,
      name: p.name,
      club: p.club,
      imageUrl: p.imageUrl,
      colour: p.colour,
      points,
      goals: lines.reduce((s, l) => s + l.goals, 0),
      assists: lines.reduce((s, l) => s + l.assists, 0),
      minutes: lines.reduce((s, l) => s + l.minutes, 0),
      live: mine.some((s) => s.fixture.status === "LIVE"),
      captain: p.captain,
    };
  });
  players.sort((a, b) => Number(b.live) - Number(a.live) || b.points - a.points || a.name.localeCompare(b.name));
  return {
    entries: entries
      .map((e, i): LiveEntry => ({ competitionId: e.competition.id, name: e.competition.name, points: Math.round((e.provisionalPoints ?? 0) * 10) / 10, rank: ranks[i], entries: e.competition._count.entries }))
      .sort((a, b) => a.rank - b.rank),
    players,
  };
}

export async function liveBoard(userId?: string | null, now = new Date(), scope: LiveScope = "all"): Promise<LiveBoard> {
  const [{ fixtures, quick }, mine] = await Promise.all([tickerFixtures(now, scope), userId ? myLive(userId, scope) : Promise.resolve(null)]);
  return { fixtures, liveCount: fixtures.filter((f) => f.status === "LIVE").length, mine, generatedAt: now.toISOString(), fast: quick };
}

/**
 * "⚽ Your player scored": for every goal by a player in a manager's locked squad this gameweek,
 * one notification (to the phone too). Keyed on the goal count, so each goal is told once.
 */
export async function alertGoals(now = new Date()) {
  const stats = await db.playerMatchStat.findMany({
    where: { isCurrent: true, fixture: { OR: [{ status: "LIVE" }, { status: "FINISHED", finalisedAt: { gte: new Date(now.getTime() - 3 * HOUR) } }] } },
    select: { playerId: true, stats: true, fixtureId: true, fixture: { select: { gameweekId: true, gameweek: { select: { simulated: true } }, homeGoals: true, awayGoals: true, homeClub: { select: { code: true } }, awayClub: { select: { code: true } } } }, player: { select: { displayName: true } } },
  });
  const scorers = stats.map((s) => ({ ...s, line: toStatLine(s.stats) })).filter((s) => s.line.goals > 0);
  let sent = 0;
  for (const s of scorers) {
    const owners = await db.competitionSelection.findMany({
      where: { playerId: s.playerId, entry: { status: "ACTIVE", competition: { gameweekId: s.fixture.gameweekId, status: { in: ["LOCKED", "PROVISIONAL"] } } } },
      select: { entry: { select: { userId: true } } },
      distinct: ["entryId"],
    });
    const users = [...new Set(owners.map((o) => o.entry.userId))];
    const score = `${s.fixture.homeClub.code} ${s.fixture.homeGoals ?? 0}–${s.fixture.awayGoals ?? 0} ${s.fixture.awayClub.code}`;
    for (const userId of users) {
      for (let g = 1; g <= s.line.goals; g++) {
        await notify(userId, {
          kind: "GOAL",
          title: `⚽ ${s.fixture.gameweek.simulated ? "SIM " : ""}GOAL! ${s.player.displayName}${g > 1 ? ` (${g === 2 ? "brace" : g === 3 ? "hat-trick" : `${g} goals`})` : ""}`,
          body: `${score} — points for your squad.`,
          href: "/live",
          dedupeKey: `goal:${s.fixtureId}:${s.playerId}:${g}:${userId}`,
        });
        sent++;
      }
    }
  }
  return sent;
}

/**
 * Man of the Match: for every finished game, the player with the most MATCHX points (before any
 * bonus; ties go to goals, then assists, then minutes). Re-checked for a week so provider
 * corrections can change it; when it changes, that gameweek's live scores are recalculated and
 * managers with him in a locked squad are told.
 */
export async function awardMotm(now = new Date()) {
  const fixtures = await db.fixture.findMany({
    where: { status: "FINISHED", OR: [{ finalisedAt: { gte: new Date(now.getTime() - 7 * 24 * HOUR) } }, { motmPlayerId: null, finalisedAt: { not: null } }] },
    select: { id: true, gameweekId: true, motmPlayerId: true, homeGoals: true, awayGoals: true, homeClub: { select: { code: true } }, awayClub: { select: { code: true } } },
    take: 300,
  });
  if (!fixtures.length) return 0;
  const stats = await db.playerMatchStat.findMany({
    where: { isCurrent: true, fixtureId: { in: fixtures.map((f) => f.id) } },
    select: { fixtureId: true, playerId: true, stats: true, player: { select: { position: true, displayName: true } } },
  });
  const rules = getScoringRules(CURRENT_SCORING_RULES);
  const changedGws = new Set<string>();
  let changed = 0;
  for (const f of fixtures) {
    const ranked = stats
      .filter((s) => s.fixtureId === f.id)
      .map((s) => ({ s, line: toStatLine(s.stats) }))
      .filter((x) => x.line.minutes > 0)
      .map((x) => ({ ...x, pts: scorePlayer(rules, x.s.player.position, [x.line]).points }))
      .sort((a, b) => b.pts - a.pts || b.line.goals - a.line.goals || b.line.assists - a.line.assists || b.line.minutes - a.line.minutes || a.s.playerId.localeCompare(b.s.playerId));
    const best = ranked[0];
    if (!best || best.s.playerId === f.motmPlayerId) continue;
    await db.fixture.update({ where: { id: f.id }, data: { motmPlayerId: best.s.playerId } });
    changedGws.add(f.gameweekId);
    changed++;
    const owners = await db.competitionSelection.findMany({
      where: { playerId: best.s.playerId, entry: { status: "ACTIVE", competition: { gameweekId: f.gameweekId, status: { in: ["LOCKED", "PROVISIONAL"] } } } },
      select: { entry: { select: { userId: true } } },
    });
    for (const userId of new Set(owners.map((o) => o.entry.userId))) {
      await notify(userId, {
        kind: "MOTM",
        title: `🏅 ${best.s.player.displayName} is Man of the Match`,
        body: `${f.homeClub.code} ${f.homeGoals ?? 0}–${f.awayGoals ?? 0} ${f.awayClub.code} — +${rules.motm ?? 3} bonus points for your squad.`,
        href: "/live",
        dedupeKey: `motm:${f.id}:${best.s.playerId}:${userId}`,
      });
    }
  }
  if (changedGws.size) {
    const { refreshProvisional } = await import("./gameweeks");
    for (const gw of changedGws) await refreshProvisional(gw);
  }
  return changed;
}
