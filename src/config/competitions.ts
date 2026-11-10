import type { RewardRule } from "@/server/scoring";

/**
 * Competition templates created for each gameweek (spec §6.2). Formats and rule-set versions
 * are configuration, not code.
 *
 * Rewards are TO CONFIRM (no reward economy has been approved). Production templates carry no
 * rewards; DEV_REWARDS are only attached when the DEV_TOOLS flag is on so the loop can be
 * play-tested.
 */
export interface CompetitionTemplate {
  key: string;
  name: string;
  format: "OPEN" | "BRONZE_ONLY" | "SILVER_ONLY" | "GOLD_ONLY";
  rosterRules: string;
  scoringRules: string;
  rewards: RewardRule[];
  devRewards: RewardRule[];
}

export const FOOTBALL_COMPETITION_TEMPLATES: CompetitionTemplate[] = [
  {
    key: "open",
    name: "Open League",
    format: "OPEN",
    rosterRules: "football-roster-v3",
    scoringRules: "football-scoring-v2-draft",
    rewards: [],
    devRewards: [
      { rankFrom: 1, rankTo: 1, packSkuCode: "football-eng-gold" },
      { rankFrom: 2, rankTo: 3, packSkuCode: "football-eng-silver" },
      { rankFrom: 4, rankTo: 1_000_000, packSkuCode: "football-eng-bronze" },
    ],
  },
  {
    key: "bronze",
    name: "Bronze Cup",
    format: "BRONZE_ONLY",
    rosterRules: "football-roster-v3",
    scoringRules: "football-scoring-v2-draft",
    rewards: [],
    devRewards: [{ rankFrom: 1, rankTo: 3, packSkuCode: "football-eng-silver" }],
  },
  {
    key: "silver",
    name: "Silver Cup",
    format: "SILVER_ONLY",
    rosterRules: "football-roster-v3",
    scoringRules: "football-scoring-v2-draft",
    rewards: [],
    devRewards: [{ rankFrom: 1, rankTo: 3, packSkuCode: "football-eng-silver" }],
  },
];
