import { createHash } from "node:crypto";
import type { Position } from "../packs/config";
import { FORMATIONS, type RosterRules, matchFormation } from "./rules";

/**
 * Football scoring (spec §6.4). Rule sets are versioned and immutable once used: to change
 * values, add a new version. A score is a pure function of (rule version, selections, stat
 * lines), so it can always be recalculated from stored source data.
 */

/** Provider-agnostic stat line for one player in one fixture (see providers/football/types.ts). */
export interface StatLine {
  minutes: number;
  goals: number;
  assists: number;
  penaltySaves: number;
  saves: number;
  tackles: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  penaltiesMissed: number;
  /** Goals conceded by the player's team while they were on the pitch. */
  goalsConceded: number;
}

export const EMPTY_STAT_LINE: StatLine = {
  minutes: 0,
  goals: 0,
  assists: 0,
  penaltySaves: 0,
  saves: 0,
  tackles: 0,
  yellowCards: 0,
  redCards: 0,
  ownGoals: 0,
  penaltiesMissed: 0,
  goalsConceded: 0,
};

export const STAT_KEYS = Object.keys(EMPTY_STAT_LINE) as (keyof StatLine)[];

/** Coerce untrusted/partial JSON into a complete StatLine (missing fields → 0). */
export function toStatLine(raw: unknown): StatLine {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out = { ...EMPTY_STAT_LINE };
  for (const k of STAT_KEYS) {
    const v = Number(src[k] ?? 0);
    out[k] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }
  return out;
}

export interface ScoringRules {
  id: string;
  status: "DRAFT" | "APPROVED";
  appearance: number;
  played60: number;
  goal: number;
  assist: number;
  cleanSheet: { points: number; positions: Position[]; minMinutes: number };
  penaltySave: number;
  saves: { per: number; points: number };
  tackles: { per: number; points: number };
  yellowCard: number;
  redCard: number;
  ownGoal: number;
  penaltyMissed: number;
  goalsConceded: { per: number; points: number; positions: Position[] };
  /** Bonus for Man of the Match: the top MATCHX scorer in each finished game (v3+). */
  motm?: number;
}

export const SCORING_RULES: Record<string, ScoringRules> = {
  // Values from the spec §6.4 draft table. DRAFT: the product owner has not approved them.
  "football-scoring-v1-draft": {
    id: "football-scoring-v1-draft",
    status: "DRAFT",
    appearance: 2,
    played60: 2,
    goal: 10,
    assist: 6,
    // TO CONFIRM: the draft table does not restrict clean sheets by position or minutes.
    // Applied to every position, requiring 60+ minutes, pending product-owner approval.
    cleanSheet: { points: 5, positions: ["GK", "DEF", "MID", "ATT"], minMinutes: 60 },
    penaltySave: 8,
    saves: { per: 3, points: 2 },
    tackles: { per: 3, points: 1 },
    yellowCard: -3,
    redCard: -10,
    ownGoal: -5,
    penaltyMissed: -5,
    goalsConceded: { per: 2, points: -1, positions: ["GK", "DEF"] },
  },
  // v2 (product decision 9 Nov 2026): clean sheets only for goalkeepers and defenders.
  "football-scoring-v2-draft": {
    id: "football-scoring-v2-draft",
    status: "DRAFT",
    appearance: 2,
    played60: 2,
    goal: 10,
    assist: 6,
    cleanSheet: { points: 5, positions: ["GK", "DEF"], minMinutes: 60 },
    penaltySave: 8,
    saves: { per: 3, points: 2 },
    tackles: { per: 3, points: 1 },
    yellowCard: -3,
    redCard: -10,
    ownGoal: -5,
    penaltyMissed: -5,
    goalsConceded: { per: 2, points: -1, positions: ["GK", "DEF"] },
  },
  // v3 (product decision 12 Nov 2026): +3 for Man of the Match.
  "football-scoring-v3-draft": {
    id: "football-scoring-v3-draft",
    status: "DRAFT",
    appearance: 2,
    played60: 2,
    goal: 10,
    assist: 6,
    cleanSheet: { points: 5, positions: ["GK", "DEF"], minMinutes: 60 },
    penaltySave: 8,
    saves: { per: 3, points: 2 },
    tackles: { per: 3, points: 1 },
    yellowCard: -3,
    redCard: -10,
    ownGoal: -5,
    penaltyMissed: -5,
    goalsConceded: { per: 2, points: -1, positions: ["GK", "DEF"] },
    motm: 3,
  },
};

/** Rule set used for new competitions, form and valuations. */
export const CURRENT_SCORING_RULES = "football-scoring-v3-draft";
export const MOTM_BONUS = 3;

export function getScoringRules(id: string): ScoringRules {
  const r = SCORING_RULES[id];
  if (!r) throw new Error(`Unknown scoring rule set: ${id}`);
  return r;
}

export interface ScoreItem {
  event: string;
  count: number;
  points: number;
}

export function sumStatLines(lines: StatLine[]): StatLine {
  const out = { ...EMPTY_STAT_LINE };
  for (const l of lines) for (const k of STAT_KEYS) out[k] += l[k];
  return out;
}

/** Points for one player's line(s) in a gameweek. Each fixture is scored independently. */
export function scorePlayer(rules: ScoringRules, position: Position, lines: StatLine[], motm = 0): { points: number; items: ScoreItem[] } {
  const items: ScoreItem[] = [];
  const add = (event: string, count: number, each: number) => {
    if (count > 0 && each !== 0) items.push({ event, count, points: count * each });
  };
  for (const s of lines) {
    if (s.minutes <= 0) continue;
    add("Appearance", 1, rules.appearance);
    if (s.minutes >= 60) add("Played 60+ minutes", 1, rules.played60);
    add("Goal", s.goals, rules.goal);
    add("Assist", s.assists, rules.assist);
    if (
      rules.cleanSheet.positions.includes(position) &&
      s.minutes >= rules.cleanSheet.minMinutes &&
      s.goalsConceded === 0
    ) {
      add("Clean sheet", 1, rules.cleanSheet.points);
    }
    add("Penalty save", s.penaltySaves, rules.penaltySave);
    add(`Every ${rules.saves.per} saves`, Math.floor(s.saves / rules.saves.per), rules.saves.points);
    add(`Every ${rules.tackles.per} tackles`, Math.floor(s.tackles / rules.tackles.per), rules.tackles.points);
    add("Yellow card", s.yellowCards, rules.yellowCard);
    add("Red card", s.redCards, rules.redCard);
    add("Own goal", s.ownGoals, rules.ownGoal);
    add("Missed penalty", s.penaltiesMissed, rules.penaltyMissed);
    if (rules.goalsConceded.positions.includes(position)) {
      add(
        `Every ${rules.goalsConceded.per} goals conceded`,
        Math.floor(s.goalsConceded / rules.goalsConceded.per),
        rules.goalsConceded.points,
      );
    }
  }
  if (motm > 0 && rules.motm && lines.some((l) => l.minutes > 0)) add("Man of the Match", motm, rules.motm);
  // Merge identical events across fixtures (double gameweeks) for a tidy breakdown.
  const merged = new Map<string, ScoreItem>();
  for (const it of items) {
    const m = merged.get(it.event);
    if (m) {
      m.count += it.count;
      m.points += it.points;
    } else merged.set(it.event, { ...it });
  }
  const list = [...merged.values()];
  return { points: list.reduce((s, i) => s + i.points, 0), items: list };
}

// ───────────────────────── Squad scoring with automatic substitutions ─────────────────────────

/** PLAYED: has ≥1 minute. DID_NOT_PLAY: all their fixtures are over (or void) with no minutes. PENDING: a fixture is still to come/in progress. */
export type AppearanceStatus = "PLAYED" | "DID_NOT_PLAY" | "PENDING";

export interface ScoringSelection {
  cardId: string;
  playerId: string;
  position: Position;
  slot: "STARTER" | "BENCH";
  order: number;
  /** Captain: points count double, positive or negative, if they play. */
  captain?: boolean;
  /** Vice-captain: takes the double instead if the captain doesn't play. */
  viceCaptain?: boolean;
  /** The player the manager put this week's booster on. */
  boosted?: boolean;
}

export interface PlayerGameweekData {
  appearance: AppearanceStatus;
  lines: Array<{ statId: string; line: StatLine }>;
  /** Man of the Match awards this gameweek (one per finished game). */
  motm?: number;
}

export interface SelectionResult {
  cardId: string;
  playerId: string;
  position: Position;
  slot: "STARTER" | "BENCH";
  order: number;
  appearance: AppearanceStatus;
  counted: boolean;
  points: number;
  captain?: boolean;
  /** The vice-captain doubled because the captain didn't play. */
  viceCaptain?: boolean;
  /** Carries the entry's booster. */
  boosted?: boolean;
  items: ScoreItem[];
  subbedOffFor?: string; // cardId of replacement
  subbedOnFor?: string; // cardId of starter replaced
}

export interface SquadScore {
  ruleVersion: string;
  rosterRules: string;
  total: number;
  formationUsed: string | null;
  selections: SelectionResult[];
  substitutions: Array<{ off: string; on: string; benchOrder: number }>;
  inputStatIds: string[];
  inputHash: string;
}

/** A weekly booster, played on one player of the entry (the selection marked `boosted`; see src/config/boosters.ts). */
export type Booster = "GOAL_RUSH" | "ASSIST_KING" | "CLEAN_SHEET_PLUS" | "SHIELD" | "BENCH_BOOST" | "TRIPLE_CAPTAIN";

export function scoreSquad(
  scoring: ScoringRules,
  roster: RosterRules,
  selections: ScoringSelection[],
  data: ReadonlyMap<string, PlayerGameweekData>,
  booster: Booster | null = null,
): SquadScore {
  const get = (playerId: string): PlayerGameweekData => data.get(playerId) ?? { appearance: "PENDING", lines: [] };
  const starters = selections.filter((s) => s.slot === "STARTER").sort((a, b) => a.order - b.order);
  const bench = selections.filter((s) => s.slot === "BENCH").sort((a, b) => a.order - b.order);

  // Active XI, by card id → selection
  const active = new Map(starters.map((s) => [s.cardId, s]));
  const usedBench = new Set<string>();
  const substitutions: SquadScore["substitutions"] = [];
  const subbedOff = new Map<string, string>();
  const subbedOn = new Map<string, string>();

  // Substitutions are applied starter by starter, GK first then pitch order, always trying
  // Sub 1 before Sub 2 etc. (spec §6.3). The user never triggers them manually.
  const ordered = [...starters].sort((a, b) => (a.position === "GK" ? -1 : 0) - (b.position === "GK" ? -1 : 0) || a.order - b.order);
  for (const starter of ordered) {
    if (get(starter.playerId).appearance !== "DID_NOT_PLAY") continue;
    for (const sub of bench) {
      if (usedBench.has(sub.cardId)) continue;
      if (get(sub.playerId).appearance !== "PLAYED") continue;
      if (!compatible(roster, starter, sub, active)) continue;
      active.delete(starter.cardId);
      active.set(sub.cardId, { ...sub, position: sub.position });
      usedBench.add(sub.cardId);
      substitutions.push({ off: starter.cardId, on: sub.cardId, benchOrder: sub.order });
      subbedOff.set(starter.cardId, sub.cardId);
      subbedOn.set(sub.cardId, starter.cardId);
      break;
    }
  }

  // The vice-captain only steps up once the captain is confirmed as not playing.
  const captainOut = starters.some((s) => s.captain && get(s.playerId).appearance === "DID_NOT_PLAY");
  const results: SelectionResult[] = selections.map((s) => {
    const d = get(s.playerId);
    const base = scorePlayer(
      scoring,
      s.position,
      d.lines.map((l) => l.line),
      d.motm ?? 0,
    );
    const captainCounts = !!s.captain && s.slot === "STARTER" && d.appearance === "PLAYED";
    const viceCounts = !s.captain && !!s.viceCaptain && captainOut && s.slot === "STARTER" && d.appearance === "PLAYED";
    // Only the player the manager boosted gets the booster's effect.
    const boost = s.boosted ? booster : null;
    const tripled = boost === "TRIPLE_CAPTAIN" && d.appearance === "PLAYED";
    const multiplier = tripled ? 3 : captainCounts || viceCounts ? 2 : 1;
    let points = base.points * multiplier;
    const items = [...base.items];
    // Boosters add their own line to the breakdown, so every point stays explainable.
    const total = (event: string) => base.items.filter((i) => i.event === event).reduce((n, i) => n + i.count, 0);
    const bonus = (event: string, count: number, each: number) => {
      if (count > 0) {
        items.push({ event, count, points: count * each });
        points += count * each;
      }
    };
    if (boost === "GOAL_RUSH") bonus("Goal Rush booster", total("Goal"), 5);
    if (boost === "ASSIST_KING") bonus("Assist King booster", total("Assist"), 3);
    if (boost === "CLEAN_SHEET_PLUS") {
      const cs = base.items.find((i) => i.event === "Clean sheet");
      if (cs) bonus("Clean Sheet+ booster", cs.count, cs.points / cs.count);
    }
    if (boost === "SHIELD" && points < 0) {
      items.push({ event: "Shield booster", count: 1, points: -points });
      points = 0;
    }
    return {
      cardId: s.cardId,
      playerId: s.playerId,
      position: s.position,
      slot: s.slot,
      order: s.order,
      appearance: d.appearance,
      // Super Sub: the boosted sub's points count even if they weren't needed.
      counted: (active.has(s.cardId) || (boost === "BENCH_BOOST" && s.slot === "BENCH")) && d.appearance !== "DID_NOT_PLAY",
      points,
      captain: captainCounts || undefined,
      viceCaptain: viceCounts || undefined,
      boosted: (booster && s.boosted) || undefined,
      items,
      subbedOffFor: subbedOff.get(s.cardId),
      subbedOnFor: subbedOn.get(s.cardId),
    };
  });

  const counts = { GK: 0, DEF: 0, MID: 0, ATT: 0 } as Record<Position, number>;
  for (const s of active.values()) counts[s.position]++;
  // Report the shape actually fielded after subs (matched against every known formation).
  const formationUsed = matchFormation({ ...roster, allowedFormations: Object.keys(FORMATIONS) }, counts)?.id ?? null;

  const inputStatIds = [...new Set(selections.flatMap((s) => get(s.playerId).lines.map((l) => l.statId)))].sort();
  const inputHash = hashInputs(scoring.id, roster.id, selections, data, booster);
  const total = results.filter((r) => r.counted).reduce((s, r) => s + r.points, 0);

  return {
    ruleVersion: scoring.id,
    rosterRules: roster.id,
    total,
    formationUsed,
    selections: results.sort((a, b) => (a.slot === b.slot ? a.order - b.order : a.slot === "STARTER" ? -1 : 1)),
    substitutions,
    inputStatIds,
    inputHash,
  };
}

function compatible(
  roster: RosterRules,
  starter: ScoringSelection,
  sub: ScoringSelection,
  active: Map<string, ScoringSelection>,
): boolean {
  if (starter.position === "GK" || sub.position === "GK") return starter.position === sub.position;
  if (roster.autoSub.compatibility === "SAME_POSITION") return starter.position === sub.position;
  const counts = { GK: 0, DEF: 0, MID: 0, ATT: 0 } as Record<Position, number>;
  for (const s of active.values()) if (s.cardId !== starter.cardId) counts[s.position]++;
  counts[sub.position]++;
  return matchFormation(roster, counts) !== undefined;
}

function hashInputs(
  scoringId: string,
  rosterId: string,
  selections: ScoringSelection[],
  data: ReadonlyMap<string, PlayerGameweekData>,
  booster: Booster | null = null,
): string {
  const canonical = {
    ...(booster ? { booster, boostedOn: selections.find((s) => s.boosted)?.cardId ?? null } : {}),
    scoringId,
    rosterId,
    selections: [...selections]
      .sort((a, b) => a.cardId.localeCompare(b.cardId))
      .map((s) => [s.cardId, s.playerId, s.position, s.slot, s.order]),
    data: [...new Set(selections.map((s) => s.playerId))].sort().map((pid) => {
      const d = data.get(pid);
      const row = [pid, d?.appearance ?? "PENDING", [...(d?.lines ?? [])].sort((a, b) => a.statId.localeCompare(b.statId)).map((l) => [l.statId, STAT_KEYS.map((k) => l.line[k] ?? 0)])];
      // Only added when awarded, so earlier calculations keep their hashes.
      return d?.motm ? [...row, { motm: d.motm }] : row;
    }),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
