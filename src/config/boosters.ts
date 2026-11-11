/**
 * Weekly boosters (product decision 11 Nov 2026): every manager gets a free booster pack each
 * Tuesday. It holds one random booster, which the manager puts on ONE player of their choice in one
 * match entry (updated 11 Nov 2026: player-driven, not squad-wide). It expires 7 days
 * after it lands. Never for sale, and not allowed in cash-prize matches (a lucky draw mustn't decide
 * who wins money). Chances are out of 100 and add up to 100.
 */
export const BOOSTERS = {
  GOAL_RUSH: { name: "Goal Rush", icon: "⚽", description: "+5 extra points for every goal your boosted player scores.", chance: 25, rarity: "Common", benchOnly: false },
  ASSIST_KING: { name: "Assist King", icon: "🎯", description: "+3 extra points for every assist your boosted player makes.", chance: 25, rarity: "Common", benchOnly: false },
  CLEAN_SHEET_PLUS: { name: "Clean Sheet+", icon: "🧤", description: "Your boosted player's clean-sheet points are doubled — best on a keeper or defender.", chance: 20, rarity: "Common", benchOnly: false },
  SHIELD: { name: "Shield", icon: "🛡️", description: "If your boosted player ends on minus points, they count as 0 instead.", chance: 15, rarity: "Rare", benchOnly: false },
  BENCH_BOOST: { name: "Super Sub", icon: "🪑", description: "Put it on a sub: their points count even if they aren't needed to come on.", chance: 10, rarity: "Rare", benchOnly: true },
  TRIPLE_CAPTAIN: { name: "Triple Up", icon: "👑", description: "Your boosted player scores ×3 (it replaces the captain's ×2 if you put it on your captain).", chance: 5, rarity: "Epic", benchOnly: false },
} as const;
export type BoosterKind = keyof typeof BOOSTERS;
export const BOOSTER_KINDS = Object.keys(BOOSTERS) as BoosterKind[];
export const BOOSTER_LIFETIME_DAYS = 7;
/** Tuesday, 9am UK time. */
export const BOOSTER_DROP = { weekday: 2, hour: 9 };
