import { leaderboard, prizesSummary } from "./competitions";
import { db } from "./db";
import { currentGameweek } from "./gameweeks";
import { REAL_TIME_HALF, simClock } from "./sim-matchday";

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
  kind: "goal" | "own_goal" | "yellow" | "red" | "pen_miss";
}

export interface WatchTable {
  id: string;
  name: string;
  pot: string | null;
  status: string;
  rows: Array<{ userId: string; name: string; club: string | null; points: number; rank: number; me: boolean }>;
}

export interface WatchBoard {
  scope: WatchScope;
  title: string;
  phase: "none" | "pre" | "live" | "ft";
  clock: string | null;
  kickoffAt: string | null;
  fixtures: WatchFixture[];
  feed: WatchLine[];
  tables: WatchTable[];
  generatedAt: string;
}

const SETTLED_SHOW_MS = 60 * 60_000;

async function pickGameweek(scope: WatchScope, now: Date) {
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

export async function watchBoard(scope: WatchScope, userId: string | null, now = new Date()): Promise<WatchBoard> {
  const gw = await pickGameweek(scope, now);
  const empty: WatchBoard = { scope, title: scope === "sim" ? "Simulated matchday" : "Gameweek", phase: "none", clock: null, kickoffAt: null, fixtures: [], feed: [], tables: [], generatedAt: now.toISOString() };
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
  const clock = gw.simulated ? (phase === "ft" ? "FT" : phase === "live" ? simClock(kickoff, now, gw.simHalfSeconds ?? REAL_TIME_HALF) : null) : live ? "LIVE" : done ? "FT" : null;

  const comps = await db.competition.findMany({ where: { gameweekId: gw.id, status: { not: "CANCELLED" } }, orderBy: [{ entryFeeMinor: "asc" }, { name: "asc" }], select: { id: true, name: true, rewards: true, status: true } });
  const tables: WatchTable[] = [];
  for (const c of comps) {
    const lb = await leaderboard(c.id, 50);
    const pot = prizesSummary(c.rewards).split(" · ")[0] || null;
    tables.push({
      id: c.id,
      name: c.name,
      pot,
      status: c.status,
      rows: lb.map((r) => ({ userId: r.userId, name: r.displayName, club: r.clubName, points: Math.round(r.points * 10) / 10, rank: r.rank, me: r.userId === userId })),
    });
  }
  // Matches you're in first.
  tables.sort((a, b) => Number(b.rows.some((r) => r.me)) - Number(a.rows.some((r) => r.me)));

  return {
    scope,
    title: gw.simulated ? `SIM Matchday ${gw.number}` : `Gameweek ${gw.number}`,
    phase,
    clock,
    kickoffAt: kickoff.toISOString(),
    fixtures,
    feed: feed.slice(0, 40),
    tables,
    generatedAt: now.toISOString(),
  };
}
