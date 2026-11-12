import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer, sumStatLines, toStatLine, type StatLine } from "@/domain/football/scoring";
import type { Position } from "@/generated/prisma/client";
import { toKit, type Kit } from "@/lib/kit";
import { db } from "./db";

/**
 * Top performers: players ranked by the points they scored in MATCHX from real match stats,
 * using the current scoring rules (the same points a manager earns when the player is in their
 * squad, before captaincy). Used by the public Top performers page and by admins to pick a
 * top performer from each league for player drops.
 */

export type PerformanceWindow = "last" | "5" | "season";
export const WINDOW_LABEL: Record<PerformanceWindow, string> = { last: "Last gameweek", "5": "Last 5 gameweeks", season: "Season" };

export interface PerformerRow {
  playerId: string;
  name: string;
  position: Position;
  squadNumber: number | null;
  club: string | null;
  clubShort: string | null;
  clubPrimary: string;
  clubSecondary: string;
  kit: Kit;
  league: string | null;
  leagueName: string | null;
  tier: "BRONZE" | "SILVER" | "GOLD" | null;
  points: number;
  apps: number;
  goals: number;
  assists: number;
  minutes: number;
  /** Points per gameweek played, oldest first — for a sparkline. */
  byGameweek: number[];
}

/** The gameweeks in a window, newest first. Only gameweeks with stats in (provisional or settled) count. */
export async function windowGameweeks(window: PerformanceWindow) {
  const all = await db.gameweek.findMany({
    where: { simulated: false, status: { in: ["PROVISIONAL", "SETTLED"] } },
    orderBy: [{ season: "desc" }, { number: "desc" }],
    select: { id: true, number: true, season: true },
  });
  if (!all.length) return [];
  if (window === "last") return all.slice(0, 1);
  if (window === "5") return all.slice(0, 5);
  return all.filter((g) => g.season === all[0].season);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Every player who played in the window, with their MATCHX points, best first. */
export async function performanceTable(f: { window?: PerformanceWindow; league?: string; position?: Position; gameweekIds?: string[] } = {}): Promise<PerformerRow[]> {
  const gws = f.gameweekIds ? f.gameweekIds.map((id) => ({ id })) : await windowGameweeks(f.window ?? "5");
  if (!gws.length) return [];
  const order = [...gws].reverse().map((g) => g.id); // oldest first
  const stats = await db.playerMatchStat.findMany({
    where: {
      isCurrent: true,
      fixture: { gameweekId: { in: order } },
      player: { position: f.position, club: f.league ? { league: { code: f.league } } : undefined },
    },
    select: { playerId: true, stats: true, fixture: { select: { gameweekId: true } } },
  });

  const lines = new Map<string, Map<string, StatLine[]>>();
  for (const s of stats) {
    const line = toStatLine(s.stats);
    if (line.minutes <= 0) continue;
    const byGw = lines.get(s.playerId) ?? new Map<string, StatLine[]>();
    byGw.set(s.fixture.gameweekId, [...(byGw.get(s.fixture.gameweekId) ?? []), line]);
    lines.set(s.playerId, byGw);
  }
  if (!lines.size) return [];

  const players = await db.player.findMany({
    where: { id: { in: [...lines.keys()] } },
    select: {
      id: true,
      displayName: true,
      position: true,
      squadNumber: true,
      club: { select: { name: true, shortName: true, primaryColour: true, secondaryColour: true, kit: true, league: { select: { code: true, name: true } } } },
      templates: { where: { active: true, edition: "STANDARD" }, select: { category: true }, orderBy: { version: "desc" }, take: 1 },
    },
  });

  const rules = getScoringRules(CURRENT_SCORING_RULES);
  const rows = players.map((p): PerformerRow => {
    const byGw = lines.get(p.id)!;
    const pts = order.filter((g) => byGw.has(g)).map((g) => scorePlayer(rules, p.position, byGw.get(g)!).points);
    const total = sumStatLines([...byGw.values()].flat());
    return {
      playerId: p.id,
      name: p.displayName,
      position: p.position,
      squadNumber: p.squadNumber,
      club: p.club?.name ?? null,
      clubShort: p.club?.shortName ?? null,
      clubPrimary: p.club?.primaryColour ?? "#2a2f38",
      clubSecondary: p.club?.secondaryColour ?? "#ffffff",
      kit: toKit(p.club?.kit, p.club?.primaryColour ?? "#2a2f38", p.club?.secondaryColour ?? "#ffffff"),
      league: p.club?.league.code ?? null,
      leagueName: p.club?.league.name ?? null,
      tier: p.templates[0]?.category ?? null,
      points: round1(pts.reduce((a, b) => a + b, 0)),
      apps: [...byGw.values()].flat().length,
      goals: total.goals,
      assists: total.assists,
      minutes: total.minutes,
      byGameweek: pts.map(round1),
    };
  });
  // Ties: fewer minutes ranks higher (more points per minute), then name for a stable order.
  return rows.sort((a, b) => b.points - a.points || a.minutes - b.minutes || a.name.localeCompare(b.name));
}

/** The best `n` performers in each league, keyed by league code. */
export async function topPerLeague(window: PerformanceWindow = "5", n = 1) {
  const rows = await performanceTable({ window });
  const out = new Map<string, PerformerRow[]>();
  for (const r of rows) {
    if (!r.league) continue;
    const list = out.get(r.league) ?? [];
    if (list.length < n) out.set(r.league, [...list, r]);
  }
  return out;
}

/** Points per player for the window, for joining onto other tables (e.g. the admin player database). */
export async function pointsByPlayer(window: PerformanceWindow = "5") {
  const rows = await performanceTable({ window });
  return new Map(rows.map((r) => [r.playerId, r.points]));
}

export interface FormGame {
  opponent: string;
  home: boolean;
  points: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
}

/**
 * Form guide: each player's last 4 finished matches for their club (a match they missed shows
 * 0 minutes), with the MATCHX points each one scored — from real stats, same rules as matches.
 */
export async function formGuide(playerIds: string[], games = 4) {
  const out = new Map<string, { games: FormGame[]; total: number; avg: number | null; hot: boolean }>();
  if (!playerIds.length) return out;
  const players = await db.player.findMany({ where: { id: { in: playerIds } }, select: { id: true, position: true, clubId: true } });
  const clubIds = [...new Set(players.map((p) => p.clubId).filter((c): c is string => !!c))];
  const fixtures = await db.fixture.findMany({
    where: { status: "FINISHED", gameweek: { simulated: false }, OR: [{ homeClubId: { in: clubIds } }, { awayClubId: { in: clubIds } }] },
    orderBy: { kickoffAt: "desc" },
    take: Math.max(40, clubIds.length * games * 2),
    select: { id: true, homeClubId: true, awayClubId: true, homeClub: { select: { code: true } }, awayClub: { select: { code: true } } },
  });
  const stats = await db.playerMatchStat.findMany({
    where: { isCurrent: true, playerId: { in: playerIds }, fixtureId: { in: fixtures.map((f) => f.id) } },
    select: { playerId: true, fixtureId: true, stats: true },
  });
  const rules = getScoringRules(CURRENT_SCORING_RULES);
  for (const p of players) {
    if (!p.clubId) continue;
    const mine = fixtures.filter((f) => f.homeClubId === p.clubId || f.awayClubId === p.clubId).slice(0, games);
    const list: FormGame[] = mine
      .map((f) => {
        const home = f.homeClubId === p.clubId;
        const s = stats.find((x) => x.playerId === p.id && x.fixtureId === f.id);
        const line = s ? toStatLine(s.stats) : null;
        const played = !!line && line.minutes > 0;
        return {
          opponent: home ? f.awayClub.code : f.homeClub.code,
          home,
          points: played ? round1(scorePlayer(rules, p.position, [line!]).points) : 0,
          minutes: played ? line!.minutes : 0,
          goals: played ? line!.goals : 0,
          assists: played ? line!.assists : 0,
          cleanSheet: played && line!.minutes >= 60 && line!.goalsConceded === 0 && p.position !== "ATT",
        };
      })
      .reverse(); // oldest first, so the newest game is on the right
    if (!list.length) continue;
    const playedGames = list.filter((g) => g.minutes > 0);
    const total = round1(list.reduce((s, g) => s + g.points, 0));
    const avg = playedGames.length ? round1(total / playedGames.length) : null;
    out.set(p.id, { games: list, total, avg, hot: playedGames.length >= 3 && (avg ?? 0) >= 6 });
  }
  return out;
}
