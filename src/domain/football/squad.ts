import type { Category, Position } from "../packs/config";
import {
  type CompetitionFormat,
  type RosterRules,
  FORMATIONS,
  categoriesForFormat,
  formationCounts,
} from "./rules";

/** A card as the squad validator sees it (already resolved server-side from the DB). */
export interface SquadCard {
  cardId: string;
  playerId: string;
  playerPosition: Position;
  category: Category;
}

export interface SquadSubmission {
  formation: string;
  /** Starters with the pitch position they are picked in. */
  starters: Array<{ cardId: string; position: Position }>;
  /** Bench in substitution order: index 0 = Sub 1. */
  bench: string[];
}

export interface SquadIssue {
  code:
    | "FORMATION_NOT_ALLOWED"
    | "WRONG_STARTER_COUNT"
    | "WRONG_BENCH_COUNT"
    | "POSITION_COUNTS"
    | "POSITION_MISMATCH"
    | "DUPLICATE_CARD"
    | "DUPLICATE_PLAYER"
    | "UNKNOWN_CARD"
    | "CATEGORY_NOT_ALLOWED";
  message: string;
  cardId?: string;
}

/** Pure roster validation. Ownership, locks and deadlines are checked by the server layer. */
export function validateSquad(
  rules: RosterRules,
  format: CompetitionFormat,
  submission: SquadSubmission,
  cards: ReadonlyMap<string, SquadCard>,
): SquadIssue[] {
  const issues: SquadIssue[] = [];

  if (!rules.allowedFormations.includes(submission.formation) || !FORMATIONS[submission.formation]) {
    issues.push({ code: "FORMATION_NOT_ALLOWED", message: `Formation ${submission.formation} is not allowed in this competition` });
  }
  if (submission.starters.length !== rules.starters) {
    issues.push({ code: "WRONG_STARTER_COUNT", message: `Pick exactly ${rules.starters} starters` });
  }
  if (submission.bench.length !== rules.bench) {
    issues.push({ code: "WRONG_BENCH_COUNT", message: `Pick exactly ${rules.bench} substitutes` });
  }

  const formation = FORMATIONS[submission.formation];
  if (formation) {
    const want = formationCounts(formation);
    const got: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    for (const s of submission.starters) got[s.position]++;
    for (const pos of ["GK", "DEF", "MID", "ATT"] as const) {
      if (got[pos] !== want[pos]) {
        issues.push({
          code: "POSITION_COUNTS",
          message: `Formation ${formation.id} needs ${want[pos]} ${pos}, got ${got[pos]}`,
        });
      }
    }
  }

  const allowedCategories = categoriesForFormat(format);
  const seenCards = new Set<string>();
  const seenPlayers = new Set<string>();
  const all = [
    ...submission.starters.map((s) => ({ cardId: s.cardId, position: s.position as Position | null })),
    ...submission.bench.map((cardId) => ({ cardId, position: null })),
  ];
  for (const { cardId, position } of all) {
    if (seenCards.has(cardId)) {
      issues.push({ code: "DUPLICATE_CARD", message: "A card can only be picked once", cardId });
      continue;
    }
    seenCards.add(cardId);
    const card = cards.get(cardId);
    if (!card) {
      issues.push({ code: "UNKNOWN_CARD", message: "Card not found in your Binder", cardId });
      continue;
    }
    if (rules.uniquePlayers) {
      if (seenPlayers.has(card.playerId)) {
        issues.push({ code: "DUPLICATE_PLAYER", message: "The same player can only be picked once", cardId });
      }
      seenPlayers.add(card.playerId);
    }
    if (position && rules.strictPositions && card.playerPosition !== position) {
      issues.push({
        code: "POSITION_MISMATCH",
        message: `This player is a ${card.playerPosition} and cannot start at ${position}`,
        cardId,
      });
    }
    if (!allowedCategories.includes(card.category)) {
      issues.push({ code: "CATEGORY_NOT_ALLOWED", message: `${card.category} cards are not allowed in this competition`, cardId });
    }
  }
  return issues;
}
