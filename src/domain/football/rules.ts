import type { Category, Position } from "../packs/config";

/**
 * Football roster rules (spec §5.2, §6.2, §6.3). Versioned: every competition references a
 * rule-set id and entries are validated against that exact version.
 */

export type DecisionStatus = "CONFIRMED" | "PROPOSED";

export interface Formation {
  id: string; // "DEF-MID-ATT"
  def: number;
  mid: number;
  att: number;
  status: DecisionStatus;
}

/**
 * Formations (7 starters = 1 GK + 6 outfield).
 * CONFIRMED by the product owner on 9 Nov 2026: 2-2-2, 2-3-1, 3-2-1.
 * "3-1-3" was also requested but needs 7 outfield players (8 starters), so it can't fit the
 * 7-player squad; 3-1-2 is kept as PROPOSED (disabled) pending clarification.
 */
export const FORMATIONS: Record<string, Formation> = {
  "2-2-2": { id: "2-2-2", def: 2, mid: 2, att: 2, status: "CONFIRMED" },
  "2-3-1": { id: "2-3-1", def: 2, mid: 3, att: 1, status: "CONFIRMED" },
  "3-2-1": { id: "3-2-1", def: 3, mid: 2, att: 1, status: "CONFIRMED" },
  "3-1-2": { id: "3-1-2", def: 3, mid: 1, att: 2, status: "PROPOSED" },
};

export type SubCompatibility =
  /** Bench player must play the same position as the starter they replace. */
  | "SAME_POSITION"
  /** GK only for GK; outfield swaps allowed if the resulting XI is an allowed formation. */
  | "VALID_FORMATION";

export interface RosterRules {
  id: string;
  starters: number;
  bench: number;
  allowedFormations: string[];
  /** Players must be picked in their catalogue position (positional flexibility TO CONFIRM). */
  strictPositions: boolean;
  /** Disallow two cards of the same player in one squad (stats would double count). */
  uniquePlayers: boolean;
  autoSub: {
    /** A starter is "substituted off" when they record no appearance in the gameweek. */
    trigger: "NO_APPEARANCE";
    compatibility: SubCompatibility;
  };
}

export const ROSTER_RULES: Record<string, RosterRules> = {
  "football-roster-v1": {
    id: "football-roster-v1",
    starters: 7,
    bench: 4,
    allowedFormations: ["2-2-2"],
    strictPositions: true,
    uniquePlayers: true,
    autoSub: { trigger: "NO_APPEARANCE", compatibility: "VALID_FORMATION" },
  },
  /** v2: the confirmed formation list. Used by every new competition. */
  "football-roster-v2": {
    id: "football-roster-v2",
    starters: 7,
    bench: 4,
    allowedFormations: ["2-2-2", "2-3-1", "3-2-1"],
    strictPositions: true,
    uniquePlayers: true,
    autoSub: { trigger: "NO_APPEARANCE", compatibility: "VALID_FORMATION" },
  },
};

export function getRosterRules(id: string): RosterRules {
  const r = ROSTER_RULES[id];
  if (!r) throw new Error(`Unknown roster rule set: ${id}`);
  return r;
}

export type CompetitionFormat = "OPEN" | "BRONZE_ONLY" | "SILVER_ONLY" | "GOLD_ONLY";

export function categoriesForFormat(format: CompetitionFormat): Category[] {
  switch (format) {
    case "OPEN":
      return ["BRONZE", "SILVER", "GOLD"];
    case "BRONZE_ONLY":
      return ["BRONZE"];
    case "SILVER_ONLY":
      return ["SILVER"];
    case "GOLD_ONLY":
      return ["GOLD"];
  }
}

export function formationCounts(f: Formation): Record<Position, number> {
  return { GK: 1, DEF: f.def, MID: f.mid, ATT: f.att };
}

/** Returns the allowed formation matching these outfield counts, if any. */
export function matchFormation(rules: RosterRules, counts: Record<Position, number>): Formation | undefined {
  if (counts.GK !== 1) return undefined;
  return rules.allowedFormations
    .map((id) => FORMATIONS[id])
    .find((f) => f && f.def === counts.DEF && f.mid === counts.MID && f.att === counts.ATT);
}
