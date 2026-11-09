import { toStatLine } from "@/domain/football/scoring";
import { type RandomSource, seededRandom } from "@/domain/random";
import type {
  FootballDataProvider,
  ProviderClub,
  ProviderFixture,
  ProviderFixtureStatus,
  ProviderMessage,
  ProviderPlayer,
} from "./types";

/**
 * DEV ONLY — simulated football data feed.
 *
 * Generates plausible fixtures and per-player match stats for the placeholder catalogue so
 * the whole game loop (squads → ingestion → provisional → corrections → final settlement) can
 * be exercised before a licensed provider exists. It deliberately emits data in its *own* raw
 * format (snake_case, provider-style ids) so ingestion goes through the same adapter path a
 * real feed would. Never enable in production (SIMULATED_DATA flag).
 */
export const SIMULATED_PROVIDER_NAME = "sim";

export const simulatedProvider: FootballDataProvider = {
  name: SIMULATED_PROVIDER_NAME,
  normaliseStats(p) {
    return toStatLine({
      minutes: p.mins_played,
      goals: p.goals,
      assists: p.goal_assist,
      penaltySaves: p.pen_saves,
      saves: p.saves,
      tackles: p.won_tackle,
      yellowCards: p.yellow_card,
      redCards: p.red_card,
      ownGoals: p.own_goals,
      penaltiesMissed: p.pen_missed,
      goalsConceded: p.goals_conceded_on_pitch,
    });
  },
  normaliseFixture(p) {
    const status = String(p.match_status ?? "SCHEDULED").toUpperCase() as ProviderFixtureStatus;
    return {
      status,
      homeGoals: typeof p.home_score === "number" ? p.home_score : null,
      awayGoals: typeof p.away_score === "number" ? p.away_score : null,
    };
  },
};

function shuffle<T>(rng: RandomSource, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const uniform = (rng: RandomSource) => rng.int(1_000_000_000) / 1_000_000_000;
const chance = (rng: RandomSource, p: number) => uniform(rng) < p;

function poisson(rng: RandomSource, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= uniform(rng);
  } while (p > L);
  return k - 1;
}

function weighted<T>(rng: RandomSource, items: Array<[T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = uniform(rng) * total;
  for (const [v, w] of items) {
    if (r < w) return v;
    r -= w;
  }
  return items[items.length - 1][0];
}

/** Pair clubs within each group (league) for one gameweek. */
export function simulateFixtures(
  groups: ProviderClub[][],
  gameweekKey: string,
  kickoffAt: Date,
  seed: number,
): ProviderFixture[] {
  const rng = seededRandom(seed);
  const fixtures: ProviderFixture[] = [];
  for (const clubs of groups) {
    const order = shuffle(rng, clubs);
    for (let i = 0; i + 1 < order.length; i += 2) {
      const ko = new Date(kickoffAt.getTime() + rng.int(3) * 2.5 * 3600_000);
      fixtures.push({
        providerFixtureId: `sim-fx-${gameweekKey}-${order[i].ref}-${order[i + 1].ref}`,
        homeClubRef: order[i].ref,
        awayClubRef: order[i + 1].ref,
        kickoffAt: ko,
      });
    }
  }
  return fixtures;
}

interface OnPitch {
  ref: string;
  position: ProviderPlayer["position"];
  on: number;
  off: number;
}

function pickTeam(rng: RandomSource, squad: ProviderPlayer[]): OnPitch[] {
  const by = (pos: ProviderPlayer["position"]) => shuffle(rng, squad.filter((p) => p.position === pos));
  const gk = by("GK");
  const def = by("DEF");
  const mid = by("MID");
  const att = by("ATT");
  const xi = [...gk.slice(0, 1), ...def.slice(0, 4), ...mid.slice(0, 4), ...att.slice(0, 2)];
  const bench = shuffle(rng, [...def.slice(4), ...mid.slice(4), ...att.slice(2)]);
  const lineup: OnPitch[] = xi.map((p) => ({ ref: p.ref, position: p.position, on: 0, off: 90 }));
  // Up to three outfield substitutions between 55' and 85'.
  const subs = Math.min(bench.length, 1 + rng.int(3));
  const outfield = lineup.filter((p) => p.position !== "GK");
  const offs = shuffle(rng, outfield).slice(0, subs);
  offs.forEach((o, i) => {
    const minute = 55 + rng.int(31);
    o.off = minute;
    lineup.push({ ref: bench[i].ref, position: bench[i].position, on: minute, off: 90 });
  });
  return lineup;
}

interface Line {
  mins_played: number;
  goals: number;
  goal_assist: number;
  pen_saves: number;
  saves: number;
  won_tackle: number;
  yellow_card: number;
  red_card: number;
  own_goals: number;
  pen_missed: number;
  goals_conceded_on_pitch: number;
}

const emptyLine = (): Line => ({
  mins_played: 0,
  goals: 0,
  goal_assist: 0,
  pen_saves: 0,
  saves: 0,
  won_tackle: 0,
  yellow_card: 0,
  red_card: 0,
  own_goals: 0,
  pen_missed: 0,
  goals_conceded_on_pitch: 0,
});

/** Simulate one fixture and return the raw provider messages it would emit. */
export function simulateMatch(
  fixture: ProviderFixture,
  home: { club: ProviderClub; squad: ProviderPlayer[] },
  away: { club: ProviderClub; squad: ProviderPlayer[] },
  seed: number,
): ProviderMessage[] {
  const rng = seededRandom(seed);
  if (chance(rng, 0.03)) {
    return [
      {
        providerEventId: `${fixture.providerFixtureId}:result:1`,
        kind: "FIXTURE_RESULT",
        providerFixtureId: fixture.providerFixtureId,
        revision: 1,
        payload: { match_status: "postponed" },
      },
    ];
  }

  const teams = [
    { side: "home", club: home.club, lineup: pickTeam(rng, home.squad) },
    { side: "away", club: away.club, lineup: pickTeam(rng, away.squad) },
  ] as const;
  const lines = new Map<string, Line>();
  for (const t of teams) for (const p of t.lineup) lines.set(p.ref, { ...emptyLine(), mins_played: p.off - p.on });

  const sh = home.club.strengthHint ?? 50;
  const sa = away.club.strengthHint ?? 50;
  const lambdas = [1.25 * Math.sqrt(sh / sa) + 0.2, 1.25 * Math.sqrt(sa / sh)];
  const score = [0, 0];

  const onPitchAt = (lineup: readonly OnPitch[], minute: number) => lineup.filter((p) => p.on <= minute && p.off > minute);

  teams.forEach((t, ti) => {
    const opp = teams[1 - ti];
    const goals = poisson(rng, lambdas[ti]);
    for (let g = 0; g < goals; g++) {
      const minute = 1 + rng.int(90);
      const ours = onPitchAt(t.lineup, minute);
      const theirs = onPitchAt(opp.lineup, minute);
      score[ti]++;
      if (chance(rng, 0.03)) {
        const og = weighted(rng, theirs.map((p) => [p, p.position === "DEF" ? 4 : p.position === "MID" ? 1 : 0.2] as [OnPitch, number]));
        lines.get(og.ref)!.own_goals++;
      } else {
        const scorer = weighted(
          rng,
          ours.map((p) => [p, { GK: 0.01, DEF: 0.7, MID: 2.5, ATT: 5 }[p.position]] as [OnPitch, number]),
        );
        lines.get(scorer.ref)!.goals++;
        if (chance(rng, 0.7)) {
          const others = ours.filter((p) => p.ref !== scorer.ref);
          const assister = weighted(
            rng,
            others.map((p) => [p, { GK: 0.05, DEF: 1, MID: 4, ATT: 2 }[p.position]] as [OnPitch, number]),
          );
          lines.get(assister.ref)!.goal_assist++;
        }
      }
      for (const p of theirs) lines.get(p.ref)!.goals_conceded_on_pitch++;
    }
    // Saves by the opposing keeper.
    const oppGk = opp.lineup.find((p) => p.position === "GK");
    if (oppGk) lines.get(oppGk.ref)!.saves += poisson(rng, 3.2);
    // Penalties that didn't go in.
    if (chance(rng, 0.06)) {
      const taker = weighted(rng, t.lineup.map((p) => [p, p.position === "ATT" ? 5 : p.position === "MID" ? 2 : 0.1] as [OnPitch, number]));
      lines.get(taker.ref)!.pen_missed++;
      if (oppGk && chance(rng, 0.6)) lines.get(oppGk.ref)!.pen_saves++;
    }
  });

  for (const t of teams) {
    for (const p of t.lineup) {
      const l = lines.get(p.ref)!;
      const mins = l.mins_played;
      const rate = { GK: 0.1, DEF: 2.4, MID: 1.9, ATT: 0.6 }[p.position];
      l.won_tackle += poisson(rng, (rate * mins) / 90);
      if (chance(rng, 0.09 * (mins / 90))) l.yellow_card++;
      if (chance(rng, 0.006 * (mins / 90))) l.red_card++;
    }
  }

  const messages: ProviderMessage[] = [
    {
      providerEventId: `${fixture.providerFixtureId}:result:1`,
      kind: "FIXTURE_RESULT",
      providerFixtureId: fixture.providerFixtureId,
      revision: 1,
      payload: { match_status: "finished", home_score: score[0], away_score: score[1] },
    },
  ];
  for (const [ref, l] of lines) {
    messages.push({
      providerEventId: `${fixture.providerFixtureId}:player:${ref}:1`,
      kind: "PLAYER_STATS",
      providerFixtureId: fixture.providerFixtureId,
      playerRef: ref,
      revision: 1,
      payload: { ...l },
    });
  }
  return messages;
}

/**
 * Simulate a stats correction as a real provider would send after review (e.g. an assist
 * awarded late, or a goal re-attributed). Emits revision 2 for one player in the fixture.
 */
export function simulateCorrection(previous: ProviderMessage[], seed: number): ProviderMessage[] {
  const rng = seededRandom(seed);
  const statMsgs = previous.filter((m) => m.kind === "PLAYER_STATS" && Number(m.payload.mins_played) > 0);
  if (!statMsgs.length) return [];
  const target = statMsgs[rng.int(statMsgs.length)];
  const payload = { ...target.payload };
  if (Number(payload.goal_assist) > 0 && chance(rng, 0.5)) payload.goal_assist = Number(payload.goal_assist) - 1;
  else payload.goal_assist = Number(payload.goal_assist) + 1;
  const revision = target.revision + 1;
  return [
    {
      ...target,
      providerEventId: `${target.providerFixtureId}:player:${target.playerRef}:${revision}`,
      revision,
      payload,
    },
  ];
}
