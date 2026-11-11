/**
 * Weekly boosters (product decision 11 Nov 2026): every manager gets a free booster pack each
 * Tuesday. It holds one random booster, played on one match entry that gameweek, and expires 7 days
 * after it lands. Never for sale, and not allowed in cash-prize matches (a lucky draw mustn't decide
 * who wins money). Chances are out of 100 and add up to 100.
 */
export const BOOSTERS = {
  GOAL_RUSH: { name: "Goal Rush", icon: "⚽", description: "+5 points for every goal your players score.", chance: 25, rarity: "Common" },
  ASSIST_KING: { name: "Assist King", icon: "🎯", description: "+3 points for every assist your players make.", chance: 25, rarity: "Common" },
  CLEAN_SHEET_PLUS: { name: "Clean Sheet+", icon: "🧤", description: "Double clean-sheet points for your keeper and defenders.", chance: 20, rarity: "Common" },
  SHIELD: { name: "Shield", icon: "🛡️", description: "Any player who scores minus points counts as 0 instead.", chance: 15, rarity: "Rare" },
  BENCH_BOOST: { name: "Bench Boost", icon: "🪑", description: "Your four subs' points count too, even if they didn't come on.", chance: 10, rarity: "Rare" },
  TRIPLE_CAPTAIN: { name: "Triple Captain", icon: "👑", description: "Your captain scores ×3 instead of ×2.", chance: 5, rarity: "Epic" },
} as const;
export type BoosterKind = keyof typeof BOOSTERS;
export const BOOSTER_KINDS = Object.keys(BOOSTERS) as BoosterKind[];
export const BOOSTER_LIFETIME_DAYS = 7;
/** Tuesday, 9am UK time. */
export const BOOSTER_DROP = { weekday: 2, hour: 9 };
