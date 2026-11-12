import { getScoringRules, scorePlayer, type StatLine } from "@/domain/football/scoring";
import { SIMULATED_PROVIDER_NAME, type SimFeedEvent, simulateMatch, simulatedProvider } from "@/providers/football/simulated";
import type { PrizeRule } from "@/domain/football/prizes";
import { prizeRules, prizesSummary } from "./competitions";
import { db } from "./db";
import { seedOf, simPlan, weights } from "./sim-matchday";
import type { WatchPlayer } from "./watch";

/**
 * Watch again: a finished simulated matchday replayed exactly as it happened. The simulation is
 * deterministic (same seed, squads and values as at kick-off), so every minute can be rebuilt —
 * scores, the vidiprinter, every player's points and the live tables — without having recorded
 * anything. The client plays the frames on the same clock as the live game (or faster).
 */
export interface ReplayFrame {
  /** Seconds after kick-off. */
  t: number;
  clock: string;
  added: number | null;
  minute: number;
  /** Scores, home/away pairs in fixture order. */
  s: number[];
  /** Points per picked player. */
  p: Record<string, number>;
  /** Points per entry. */
  e: Record<string, number>;
}

export interface ReplayEvent {
  minute: number;
  fixture: number;
  type: SimFeedEvent["type"];
  side: "home" | "away";
  player: string;
  playerId: string | null;
  assist: string | null;
  assistId: string | null;
  saved: boolean;
}

export interface ReplayData {
  gameweekId: string;
  title: string;
  kickoffAt: string;
  duration: number;
  fixtures: Array<{ id: string; home: { code: string; name: string; colour: string }; away: { code: string; name: string; colour: string }; league: string }>;
  frames: ReplayFrame[];
  events: ReplayEvent[];
  tables: Array<{ id: string; name: string; pot: string | null; prizes: PrizeRule[]; rows: Array<{ entryId: string; userId: string; name: string; club: string | null }> }>;
  teams: Record<string, { competitionId: string; competition: string; manager: string; club: string | null; userId: string; formation: string; players: Array<Omit<WatchPlayer, "points" | "goals" | "assists" | "yellow" | "red" | "minutes" | "playing">> }>;
}

const cache = new Map<string, ReplayData>();

export async function simReplay(gameweekId: string): Promise<ReplayData | null> {
  const hit = cache.get(gameweekId);
  if (hit) return hit;
  const gw = await db.gameweek.findUnique({ where: { id: gameweekId } });
  if (!gw?.simulated || gw.status !== "SETTLED") return null;
  const fixtures = await db.fixture.findMany({
    where: { gameweekId },
    orderBy: [{ kickoffAt: "asc" }, { providerFixtureId: "asc" }],
    include: { homeClub: { include: { league: true } }, awayClub: true },
  });
  if (!fixtures.length) return null;
  const ko = fixtures[0].kickoffAt;
  const plan = simPlan(gw.id, gw.simHalfSeconds);
  const players = await db.player.findMany({
    where: { clubId: { in: fixtures.flatMap((f) => [f.homeClubId, f.awayClubId]) }, active: true },
    select: { id: true, displayName: true, clubId: true, position: true, squadNumber: true, providerRefs: true },
  });
  const w = await weights(players.map((p) => p.id), ko);
  const refOf = (p: (typeof players)[number]) => (p.providerRefs as Record<string, string>)[SIMULATED_PROVIDER_NAME];
  const byRef = new Map(players.map((p) => [refOf(p), p]));

  const comps = await db.competition.findMany({
    where: { gameweekId, status: { not: "CANCELLED" } },
    orderBy: [{ entryFeeMinor: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      rewards: true,
      scoringRules: true,
      entries: {
        where: { status: "ACTIVE" },
        take: 2000,
        select: {
          id: true,
          userId: true,
          formation: true,
          finalPoints: true,
          user: { select: { displayName: true, clubName: true } },
          selections: { orderBy: [{ slot: "asc" }, { order: "asc" }], select: { playerId: true, slot: true, position: true, isCaptain: true, player: { select: { displayName: true, club: { select: { code: true, primaryColour: true } } } } } },
        },
      },
    },
  });
  const picked = new Map<string, string>(); // playerId → position
  for (const c of comps) for (const e of c.entries) for (const s of e.selections) picked.set(s.playerId, s.position);
  const rules = getScoringRules(comps[0]?.scoringRules ?? "football-scoring-v3-draft");

  // The state of every game at a given match minute.
  const stateCache = new Map<number, { s: number[]; p: Record<string, number>; e: Record<string, number>; feed?: ReplayEvent[] }>();
  const stateAt = (minute: number) => {
    const hit = stateCache.get(minute);
    if (hit) return hit;
    const s: number[] = [];
    const lines = new Map<string, StatLine>();
    const events: ReplayEvent[] = [];
    fixtures.forEach((f, fi) => {
      const squad = (clubId: string) =>
        players.filter((p) => p.clubId === clubId).map((p) => ({ ref: refOf(p), clubRef: clubId, position: p.position, squadNumber: p.squadNumber, weight: w.get(p.id) ?? 1 }));
      const feed: SimFeedEvent[] = [];
      const msgs = simulateMatch(
        { providerFixtureId: f.providerFixtureId, homeClubRef: f.homeClub.code, awayClubRef: f.awayClub.code, kickoffAt: f.kickoffAt },
        { club: { ref: f.homeClub.code, strengthHint: f.homeClub.simStrength }, squad: squad(f.homeClubId) },
        { club: { ref: f.awayClub.code, strengthHint: f.awayClub.simStrength }, squad: squad(f.awayClubId) },
        seedOf(f.providerFixtureId),
        { atMinute: minute, noPostponements: true, feed, stepMinutes: 15 },
      );
      let h = 0;
      let a = 0;
      for (const m of msgs) {
        if (m.kind === "FIXTURE_RESULT") {
          h = Number(m.payload.home_score ?? 0);
          a = Number(m.payload.away_score ?? 0);
        } else if (m.playerRef) {
          const pl = byRef.get(m.playerRef);
          if (pl && picked.has(pl.id)) lines.set(pl.id, simulatedProvider.normaliseStats(m.payload));
        }
      }
      s.push(h, a);
      if (minute >= 90)
        for (const e of feed) {
          const p = byRef.get(e.player);
          const as = e.assist ? byRef.get(e.assist) : undefined;
          events.push({ minute: e.minute, fixture: fi, type: e.type, side: e.side, player: p?.displayName ?? "Unknown", playerId: p?.id ?? null, assist: as?.displayName ?? null, assistId: as?.id ?? null, saved: !!e.saved });
        }
    });
    const p: Record<string, number> = {};
    for (const [id, pos] of picked) {
      const l = lines.get(id);
      p[id] = l && l.minutes > 0 ? Math.round(scorePlayer(rules, pos as WatchPlayer["position"], [l]).points * 10) / 10 : 0;
    }
    const e: Record<string, number> = {};
    for (const c of comps)
      for (const en of c.entries) {
        let t = 0;
        for (const sel of en.selections) if (sel.slot === "STARTER") t += (p[sel.playerId] ?? 0) * (sel.isCaptain ? 2 : 1);
        e[en.id] = Math.round(t * 10) / 10;
      }
    const out = { s, p, e, feed: minute >= 90 ? events : undefined };
    stateCache.set(minute, out);
    return out;
  };

  const perMin = plan.half / 45;
  const frames: ReplayFrame[] = [];
  const push = (t: number, clock: string, added: number | null, minute: number) => {
    const st = stateAt(minute);
    frames.push({ t: Math.round(t * 10) / 10, clock, added, minute, s: st.s, p: st.p, e: st.e });
  };
  for (let m = 1; m <= 45; m++) push((m - 1) * perMin, `${m}'`, null, m);
  for (let x = 1; x <= plan.added1; x++) push(plan.half + (x - 1) * perMin, `45+${x}'`, plan.added1, 45);
  push(plan.firstEnd, "HT", null, 45);
  for (let m = 46; m <= 90; m++) push(plan.secondStart + (m - 46) * perMin, `${m}'`, null, Math.min(89, m));
  for (let x = 1; x <= plan.added2; x++) push(plan.secondStart + plan.half + (x - 1) * perMin, `90+${x}'`, plan.added2, 89);
  push(plan.end, "FT", null, 90);
  // Full time: the official final totals.
  const last = frames[frames.length - 1];
  for (const c of comps) for (const en of c.entries) last.e[en.id] = Math.round((en.finalPoints ?? last.e[en.id] ?? 0) * 10) / 10;

  const data: ReplayData = {
    gameweekId,
    title: `SIM Matchday ${gw.number}`,
    kickoffAt: ko.toISOString(),
    duration: plan.end,
    fixtures: fixtures.map((f) => ({
      id: f.id,
      home: { code: f.homeClub.code, name: f.homeClub.name, colour: f.homeClub.primaryColour },
      away: { code: f.awayClub.code, name: f.awayClub.name, colour: f.awayClub.primaryColour },
      league: f.homeClub.league.code,
    })),
    frames,
    events: (stateAt(90).feed ?? []).sort((a, b) => a.minute - b.minute),
    tables: await Promise.all(comps.map(async (c) => ({
      id: c.id,
      name: c.name,
      pot: prizesSummary(c.rewards).split(" · ")[0] || null,
      prizes: await prizeRules(c.rewards),
      rows: c.entries.map((e) => ({ entryId: e.id, userId: e.userId, name: e.user.displayName, club: e.user.clubName })),
    }))),
    teams: Object.fromEntries(
      comps.flatMap((c) =>
        c.entries.map((e) => [
          e.id,
          {
            competitionId: c.id,
            competition: c.name,
            manager: e.user.displayName,
            club: e.user.clubName,
            userId: e.userId,
            formation: e.formation,
            players: e.selections.map((s) => ({
              playerId: s.playerId,
              name: s.player.displayName,
              position: s.position as WatchPlayer["position"],
              club: s.player.club?.code ?? "",
              colour: s.player.club?.primaryColour ?? "#2a2f38",
              captain: s.isCaptain,
              sub: s.slot === "BENCH",
            })),
          },
        ]),
      ),
    ),
  };
  if (cache.size > 20) cache.clear();
  cache.set(gameweekId, data);
  return data;
}
