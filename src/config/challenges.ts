/**
 * Default challenges (product request 10 Nov 2026: "Sets become Challenges… discard team to get
 * 1MP — it keeps cards revolving"). Admins can add, pause or edit challenges in Admin → Challenges;
 * these are seeded once. Rewards are reward MP (spent first on packs, transfers and entries; never withdrawable).
 */
export interface ChallengeCriteria {
  /** Exactly this many cards are handed in. */
  count: number;
  tiers?: Array<"BRONZE" | "SILVER" | "GOLD">;
  positions?: Array<"GK" | "DEF" | "MID" | "ATT">;
  /** League codes, e.g. ["EPL"]. */
  leagues?: string[];
  /** Max cards from one club (e.g. 1 for "all different clubs"). */
  maxPerClub?: number;
  /** Untradeable cards (free, starter and launch cards) count by default; set false to exclude free/starter cards. */
  includeUntradeable?: boolean;
}

export interface ChallengeSeed {
  code: string;
  name: string;
  description: string;
  criteria: ChallengeCriteria;
  rewardMinor: number;
  rewardPackSku?: string;
  maxPerUser?: number;
}

export const DEFAULT_CHALLENGES: ChallengeSeed[] = [
  {
    code: "discard-team",
    name: "Clear the bench",
    description: "Hand in any 7 cards — a full starting line-up — for 1 MP.",
    criteria: { count: 7 },
    rewardMinor: 100,
  },
  {
    code: "bronze-five",
    name: "Bronze bundle",
    description: "Trade in 5 Bronze cards for an England Bronze pack.",
    criteria: { count: 5, tiers: ["BRONZE"] },
    rewardMinor: 0,
    rewardPackSku: "football-eng-bronze",
  },
  {
    code: "bronze-seven",
    name: "Bronze line-up",
    description: "Hand in a full starting seven of Bronze players for an England Bronze pack. Untradeable cards count.",
    criteria: { count: 7, tiers: ["BRONZE"] },
    rewardMinor: 0,
    rewardPackSku: "football-eng-bronze",
  },
  {
    code: "back-four",
    name: "Back four",
    description: "Hand in 4 defenders, all from different clubs.",
    criteria: { count: 4, positions: ["DEF"], maxPerClub: 1 },
    rewardMinor: 150,
  },
  {
    code: "silver-trio",
    name: "Silver service",
    description: "3 Silver cards for 3 MP.",
    criteria: { count: 3, tiers: ["SILVER"] },
    rewardMinor: 300,
  },
  {
    code: "gold-swap",
    name: "Golden handshake",
    description: "Hand in 2 Gold cards for an England Gold pack (at least 2 Premier League Golds inside).",
    criteria: { count: 2, tiers: ["GOLD"] },
    rewardMinor: 0,
    rewardPackSku: "football-eng-gold",
    maxPerUser: 3,
  },
];
