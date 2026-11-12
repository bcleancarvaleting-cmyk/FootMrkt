import { getScoringRules, scorePlayer, toStatLine, type StatLine } from "@/domain/football/scoring";
import { leaderboard, prizesSummary } from "./competitions";
import { db } from "./db";
import { currentGameweek } from "./gameweeks";
import { simAt, simPlan } from "./sim-matchday";

/**
 * "Watch live": one gameweek on one screen — every fixture's score, a vidiprinter of what's just
 * happened, and each match's live table so managers see their names go up and down. For a
 * simulated matchday (scope "sim") or the real gameweek in play (scope "real").
 */
export type WatchScope = "sim" | "real";

export interface WatchFixture {
  id: string;
  home: { code: string; name: string; colour: string };
  away: { code: string; name: string; colour: string };
  league: string;
  homeGoals: number;
  awayGoals: number;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
}

export interface WatchLine {
  key: string;
  minute: number;
  text: string;
  score: string;
  kind: "goal" | "own_goal" | "yellow" | "red" | "pen_miss" | "time";
}

export interface WatchTable {
  id: string;
  name: string;
  pot: string | null;
  status: string;
  /** Entries are closed: managers can open each other's teams. */
  locked: boolean;
  rows: Array<{ entryId: string; userId: string; name: string; club: string | null; points: number; rank: number; me: boolean }>;
}

/** One player in a team on the watch screen, with live points. */
export interface WatchPlayer {
  playerId: string;
  name: string;
  position: "GK" | "DEF" | "MID" | "ATT";
  club: string;
  colour: string;
  captain: boolean;
  sub: boolean;
  points: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  minutes: number;
  playing: boolean;
}

export interface WatchTeam {
  entryId: string;
  competitionId: string;
  competition: string;
  manager: string;
  club: string | null;
  formation: string;
  points: number;
  rank: number;
  entries: number;
  players: WatchPlayer[];
}

export interface WatchBoard {
  scope: WatchScope;
  title: string;
  phase: "none" | "pre" | "live" | "ft";
  clock: string | null;
  /** Minutes of added time while it's being played (the fourth official's board). */
  added: number | null;
  kickoffAt: string | null;
  fixtures: WatchFixture[];
  feed: WatchLine[];
  tables: WatchTable[];
  /** The viewer's teams on this matchday (one per match entered), with live points. */
  mine: WatchTeam[];
  /** When entries close (the match sheet counts down to it). */
  locksAt: string | null;
  /** A link to enter, if the viewer hasn't. */
  enterHref: string | null;
  /** A finished simulated matchday can be watched again. */
  replay: boolean;
  gameweekId: string | null;
  generatedAt: string;
}

const SETTLED_SHOW_MS = 60 * 60_000;

async function pickGameweek(scope: WatchScope, now: Date, gameweekId?: string | null) {
  if (gameweekId) return db.gameweek.findUnique({ where: { id: gameweekId } });
  if (scope === "real") return currentGameweek();
  // The sim matchday in play, else the next one, else the one that just finished.
  return (
    (await db.gameweek.findFirst({ where: { simulated: true, status: { in: ["LOCKED", "PROVISIONAL"] } }, orderBy: { startsAt: "desc" } })) ??
    (await db.gameweek.findFirst({ where: { simulated: true, status: { in: ["OPEN", "UPCOMING"] } }, orderBy: { startsAt: "asc" } })) ??
    (await db.gameweek.findFirst({ where: { simulated: true, status: "SETTLED", endsAt: { gte: new Date(now.getTime() - SETTLED_SHOW_MS) } }, orderBy: { startsAt: "desc" } }))
  );
}

/** Is there something to watch right now (for the home page button)? */
export async function watchable(now = new Date()) {
  const sim = await db.gameweek.findFirst({
    where: { simulated: true, OR: [{ status: { in: ["LOCKED", "PROVISIONAL"] } }, { status: "OPEN", startsAt: { lte: new Date(now.getTime() + 30 * 60_000) } }] },
    select: { id: true },
  });
  const real = await db.fixture.count({ where: { status: "LIVE", gameweek: { simulated: false } } });
  return { sim: !!sim, real: real > 0 };
}

export async function watchBoard(scope: WatchScope, userId: string | null, now = new Date(), gameweekId?: string | null): Promise<WatchBoard> {
  const gw = await pickGameweek(scope, now, gameweekId);
  const empty: WatchBoard = { scope, title: scope === "sim" ? "Simulated matchday" : "Gameweek", phase: "none", clock: null, added: null, kickoffAt: null, fixtures: [], feed: [], tables: [], mine: [], locksAt: null, enterHref: null, replay: false, gameweekId: null, generatedAt: now.toISOString() };
  if (!gw) return empty;
  const rows = await db.fixture.findMany({
    where: { gameweekId: gw.id },
    orderBy: [{ kickoffAt: "asc" }, { providerFixtureId: "asc" }],
    select: {
      id: true,
      status: true,
      homeGoals: true,
      awayGoals: true,
      kickoffAt: true,
      simEvents: true,
      homeClub: { select: { code: true, name: true, primaryColour: true, league: { select: { code: true, tier: true } } } },
      awayClub: { select: { code: true, name: true, primaryColour: true } },
    },
  });
  const fixtures: WatchFixture[] = rows.map((f) => ({
    id: f.id,
    home: { code: f.homeClub.code, name: f.homeClub.name, colour: f.homeClub.primaryColour },
    away: { code: f.awayClub.code, name: f.awayClub.name, colour: f.awayClub.primaryColour },
    league: f.homeClub.league.code,
    homeGoals: f.homeGoals ?? 0,
    awayGoals: f.awayGoals ?? 0,
    status: f.status === "ABANDONED" ? "POSTPONED" : (f.status as WatchFixture["status"]),
  }));

  // Vidiprinter: every event so far, with the score it made, newest first.
  const feed: WatchLine[] = [];
  for (const f of rows) {
    const ev = ((f.simEvents as Array<{ minute: number; type: WatchLine["kind"]; side: "home" | "away"; player: string; assist?: string | null; saved?: boolean }> | null) ?? []).slice().sort((a, b) => a.minute - b.minute);
    let h = 0;
    let a = 0;
    for (const [i, e] of ev.entries()) {
      if (e.type === "goal" || e.type === "own_goal") e.side === "home" ? h++ : a++;
      const team = e.side === "home" ? f.homeClub.name : f.awayClub.name;
      const text =
        e.type === "goal"
          ? `GOAL! ${e.player} (${team})${e.assist ? ` — assisted by ${e.assist}` : ""}`
          : e.type === "own_goal"
            ? `OWN GOAL! ${e.player}`
            : e.type === "yellow"
              ? `Yellow card: ${e.player} (${team})`
              : e.type === "red"
                ? `SENT OFF! ${e.player} (${team})`
                : `Penalty ${e.saved ? "saved" : "missed"}: ${e.player} (${team})`;
      feed.push({ key: `${f.id}:${i}`, minute: e.minute, text, score: `${f.homeClub.name} ${h}–${a} ${f.awayClub.name}`, kind: e.type });
    }
  }
  feed.sort((x, y) => y.minute - x.minute || x.key.localeCompare(y.key));

  const kickoff = rows[0]?.kickoffAt ?? gw.startsAt;
  const live = fixtures.some((f) => f.status === "LIVE");
  const done = fixtures.length > 0 && fixtures.every((f) => f.status === "FINISHED" || f.status === "POSTPONED");
  const phase: WatchBoard["phase"] = live ? "live" : done ? "ft" : now < kickoff ? "pre" : "live";
  const at = gw.simulated ? simAt(simPlan(gw.id, gw.simHalfSeconds), kickoff, now) : null;
  const clock = at ? (phase === "ft" ? "FT" : phase === "live" ? at.clock : null) : live ? "LIVE" : done ? "FT" : null;
  // The match's own moments in the vidiprinter: added time, half time, full time.
  if (gw.simulated) {
    const plan = simPlan(gw.id, gw.simHalfSeconds);
    const e = (now.getTime() - kickoff.getTime()) / 1000;
    const timeLine = (key: string, minute: number, text: string) => feed.push({ key: `t:${key}`, minute, text: "", score: text.toUpperCase(), kind: "time" });
    if (e >= plan.half) timeLine("a1", 45.1, `${plan.added1} minute${plan.added1 === 1 ? "" : "s"} added time`);
    if (e >= plan.firstEnd) timeLine("ht", 45.2, "Half time");
    if (e >= plan.secondStart) timeLine("2h", 45.3, "Second half under way");
    if (e >= plan.secondStart + plan.half) timeLine("a2", 90.1, `${plan.added2} minutes added time`);
    if (phase === "ft" || e >= plan.end) timeLine("ft", 90.2, "Full time");
    feed.sort((x, y) => y.minute - x.minute || x.key.localeCompare(y.key));
  }

  const comps = await db.competition.findMany({ where: { gameweekId: gw.id, status: { not: "CANCELLED" } }, orderBy: [{ entryFeeMinor: "asc" }, { name: "asc" }], select: { id: true, name: true, rewards: true, status: true, locksAt: true } });
  const tables: WatchTable[] = [];
  for (const c of comps) {
    const lb = await leaderboard(c.id, 50);
    const pot = prizesSummary(c.rewards).split(" · ")[0] || null;
    tables.push({
      id: c.id,
      name: c.name,
      pot,
      status: c.status,
      locked: !["OPEN", "UPCOMING"].includes(c.status) || c.locksAt <= now,
      rows: lb.map((r) => ({ entryId: r.entryId, userId: r.userId, name: r.displayName, club: r.clubName, points: Math.round(r.points * 10) / 10, rank: r.rank, me: r.userId === userId })),
    });
  }
  // Matches you're in first.
  tables.sort((a, b) => Number(b.rows.some((r) => r.me)) - Number(a.rows.some((r) => r.me)));

  const myEntries = userId ? await db.competitionEntry.findMany({ where: { userId, status: "ACTIVE", competitionId: { in: comps.map((c) => c.id) } }, select: { id: true } }) : [];
  const mine = await watchTeams(myEntries.map((e) => e.id), tables);
  const openComp = comps.find((c) => ["OPEN", "UPCOMING"].includes(c.status) && c.locksAt > now);
  return {
    mine,
    locksAt: comps.length ? new Date(Math.min(...comps.map((c) => c.locksAt.getTime()))).toISOString() : null,
    enterHref: openComp && !myEntries.length ? `/competitions/${openComp.id}` : null,
    replay: gw.simulated && phase === "ft",
    gameweekId: gw.id,
    scope,
    title: gw.simulated ? `SIM Matchday ${gw.number}` : `Gameweek ${gw.number}`,
    phase,
    clock,
    added: at?.added ?? null,
    kickoffAt: kickoff.toISOString(),
    fixtures,
    feed: feed.slice(0, 40),
    tables,
    generatedAt: now.toISOString(),
  };
}

/** Teams with live points for the given entries (rank and total from the live table when given). */
export async function watchTeams(entryIds: string[], tables: WatchTable[] = []): Promise<WatchTeam[]> {
  if (!entryIds.length) return [];
  const entries = await db.competitionEntry.findMany({
    where: { id: { in: entryIds } },
    select: {
      id: true,
      formation: true,
      provisionalPoints: true,
      finalPoints: true,
      rank: true,
      user: { select: { displayName: true, clubName: true } },
      competition: { select: { id: true, name: true, gameweekId: true, scoringRules: true, status: true, _count: { select: { entries: true } } } },
      selections: {
        orderBy: [{ slot: "asc" }, { order: "asc" }],
        select: { playerId: true, slot: true, position: true, isCaptain: true, player: { select: { displayName: true, club: { select: { code: true, primaryColour: true } } } } },
      },
    },
  });
  const gwIds = [...new Set(entries.map((e) => e.competition.gameweekId))];
  const playerIds = [...new Set(entries.flatMap((e) => e.selections.map((s) => s.playerId)))];
  const stats = await db.playerMatchStat.findMany({
    where: { isCurrent: true, playerId: { in: playerIds }, fixture: { gameweekId: { in: gwIds } } },
    select: { playerId: true, stats: true, fixture: { select: { gameweekId: true, status: true } } },
  });
  return entries.map((e) => {
    const rules = getScoringRules(e.competition.scoringRules);
    const row = tables.find((t) => t.id === e.competition.id)?.rows.find((r) => r.entryId === e.id);
    const players = e.selections.map((s): WatchPlayer => {
      const mine = stats.filter((x) => x.playerId === s.playerId && x.fixture.gameweekId === e.competition.gameweekId);
      const lines: StatLine[] = mine.map((x) => toStatLine(x.stats)).filter((l) => l.minutes > 0);
      const sum = (k: keyof StatLine) => lines.reduce((t, l) => t + l[k], 0);
      return {
        playerId: s.playerId,
        name: s.player.displayName,
        position: s.position as WatchPlayer["position"],
        club: s.player.club?.code ?? "",
        colour: s.player.club?.primaryColour ?? "#2a2f38",
        captain: s.isCaptain,
        sub: s.slot === "BENCH",
        points: lines.length ? Math.round(scorePlayer(rules, s.position as WatchPlayer["position"], lines).points * 10) / 10 : 0,
        goals: sum("goals"),
        assists: sum("assists"),
        yellow: sum("yellowCards"),
        red: sum("redCards"),
        minutes: sum("minutes"),
        playing: mine.some((x) => x.fixture.status === "LIVE") && lines.length > 0,
      };
    });
    const settled = e.competition.status === "SETTLED";
    return {
      entryId: e.id,
      competitionId: e.competition.id,
      competition: e.competition.name,
      manager: e.user.displayName,
      club: e.user.clubName,
      formation: e.formation,
      points: row?.points ?? Math.round(((settled ? e.finalPoints : e.provisionalPoints) ?? 0) * 10) / 10,
      rank: row?.rank ?? e.rank ?? 0,
      entries: e.competition._count.entries,
      players,
    };
  });
}

/** Another manager's team on the watch screen: only once entries have closed (or your own). */
export async function watchTeam(entryId: string, viewerId: string | null, now = new Date()) {
  const e = await db.competitionEntry.findUnique({ where: { id: entryId }, select: { userId: true, competition: { select: { status: true, locksAt: true } } } });
  if (!e) return null;
  const closed = !["OPEN", "UPCOMING"].includes(e.competition.status) || e.competition.locksAt <= now;
  if (!closed && e.userId !== viewerId) return null;
  return (await watchTeams([entryId]))[0] ?? null;
}
