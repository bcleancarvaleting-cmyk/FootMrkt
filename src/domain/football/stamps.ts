import type { StatLine } from "./scoring";

/** Card history stamps: the big moments a card can be stamped with (pure rules, no database). */
export const STAMPS = {
  HAT_TRICK: { label: "Hat-trick", icon: "⚽⚽⚽" },
  BRACE: { label: "Brace", icon: "⚽⚽" },
  PLAYMAKER: { label: "Playmaker", icon: "🅰" },
  CLEAN_SHEET: { label: "Clean sheet", icon: "🧤" },
  PEN_SAVE: { label: "Penalty save", icon: "✋" },
  CAPTAIN_HAUL: { label: "Captain's haul", icon: "©" },
  BIG_HAUL: { label: "Big haul", icon: "🔥" },
  MATCH_WINNER: { label: "Match winner", icon: "🏆" },
} as const;
export type StampKind = keyof typeof STAMPS;

/** Which stamps a performance earns. Pure, so it's easy to test and to tune. */
export function stampsFor(p: { line: StatLine; position: string; points: number; captain: boolean; won: boolean }): StampKind[] {
  const out: StampKind[] = [];
  if (p.line.goals >= 3) out.push("HAT_TRICK");
  else if (p.line.goals === 2) out.push("BRACE");
  if (p.line.assists >= 2) out.push("PLAYMAKER");
  if ((p.position === "GK" || p.position === "DEF") && p.line.minutes >= 60 && p.line.goalsConceded === 0) out.push("CLEAN_SHEET");
  if (p.line.penaltySaves > 0) out.push("PEN_SAVE");
  if (p.captain && p.points >= 15) out.push("CAPTAIN_HAUL");
  else if (p.points >= 15) out.push("BIG_HAUL");
  if (p.won && p.line.minutes > 0) out.push("MATCH_WINNER");
  return out;
}

