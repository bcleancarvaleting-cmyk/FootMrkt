/**
 * Manager progression (product decision 10 Nov 2026): levels from lifetime XP, each with a free
 * pack, and achievements that pay a little XP. All rewards are free, untradeable packs or XP.
 */

/** Levels: name, lifetime XP needed, and the free pack granted on reaching it. */
export const LEVELS = [
  { level: 1, name: "Sunday League", xp: 0, reward: null },
  { level: 2, name: "Pub League", xp: 100, reward: "football-bronze-pick" },
  { level: 3, name: "County League", xp: 300, reward: "football-welcome-four" },
  { level: 4, name: "Non-League", xp: 600, reward: "football-silver-pick" },
  { level: 5, name: "League Two", xp: 1_000, reward: "football-eng-bronze-gift" },
  { level: 6, name: "League One", xp: 1_600, reward: "football-welcome-mix" },
  { level: 7, name: "Championship", xp: 2_500, reward: "football-eng-silver-gift" },
  { level: 8, name: "Premier League", xp: 4_000, reward: "football-gold-pick" },
  { level: 9, name: "Europa League", xp: 6_000, reward: "football-eng-gold-gift" },
  { level: 10, name: "Champions League", xp: 9_000, reward: "football-gold-pick" },
  { level: 11, name: "Legend", xp: 13_000, reward: "football-eng-gold-gift" },
] as const;

export function levelFor(lifetimeXp: number) {
  let current: (typeof LEVELS)[number] = LEVELS[0];
  for (const l of LEVELS) if (lifetimeXp >= l.xp) current = l;
  const next = LEVELS.find((l) => l.level === current.level + 1) ?? null;
  const progress = next ? Math.min(1, (lifetimeXp - current.xp) / (next.xp - current.xp)) : 1;
  return { ...current, next, progress, lifetimeXp };
}

/** Everything an achievement can be checked against (gathered once per manager). */
export interface ManagerStats {
  cards: number;
  golds: number;
  rubies: number;
  diamonds: number;
  rainbows: number;
  packsOpened: number;
  dropsSigned: number;
  entries: number;
  wins: number;
  podiums: number;
  bestScore: number;
  captained: number;
  stamps: number;
  hatTrickStamps: number;
  captainHauls: number;
  cleanSheetStamps: number;
  binders: number;
  challenges: number;
  sales: number;
  purchases: number;
  referrals: number;
  hasCrest: boolean;
  founder: boolean;
  leagues: number;
  bestStreak: number;
  predictionsRight: number;
}

/**
 * Achievements come in stages (product decision 11 Nov 2026): finish every achievement in a stage
 * to bank its stage bonus and open the next, harder stage. Achievements in a locked stage can't be
 * unlocked yet (so a stage's bonus is earned in order). "Extras" sit outside the stages.
 */
export const STAGES = [
  { stage: 1, name: "Kick-off", bonusXp: 1_000 },
  { stage: 2, name: "Pre-season", bonusXp: 1_500 },
  { stage: 3, name: "Matchday", bonusXp: 2_000 },
  { stage: 4, name: "Title race", bonusXp: 3_000 },
  { stage: 5, name: "Legend", bonusXp: 5_000 },
] as const;
export type StageNo = (typeof STAGES)[number]["stage"];

export interface Achievement {
  code: string;
  /** 1–5, or null for an extra that can be unlocked any time. */
  stage: StageNo | null;
  name: string;
  description: string;
  xp: number;
  done: (s: ManagerStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Stage 1 · Kick-off — the basics
  { code: "first-pack", stage: 1, name: "Unboxed", description: "Open your first pack", xp: 10, done: (s) => s.packsOpened >= 1 },
  { code: "crest", stage: 1, name: "Club badge", description: "Design your club crest", xp: 10, done: (s) => s.hasCrest },
  { code: "first-entry", stage: 1, name: "Team sheet in", description: "Enter your first match", xp: 15, done: (s) => s.entries >= 1 },
  { code: "first-captain", stage: 1, name: "Armband", description: "Pick a captain", xp: 10, done: (s) => s.captained >= 1 },
  { code: "gold-1", stage: 1, name: "Golden touch", description: "Own a Gold card", xp: 15, done: (s) => s.golds >= 1 },
  { code: "league", stage: 1, name: "League member", description: "Join a mini-league", xp: 15, done: (s) => s.leagues >= 1 },
  // Stage 2 · Pre-season
  { code: "entries-5", stage: 2, name: "Regular", description: "Enter 5 matches", xp: 25, done: (s) => s.entries >= 5 },
  { code: "challenge-1", stage: 2, name: "Challenge accepted", description: "Complete a challenge", xp: 20, done: (s) => s.challenges >= 1 },
  { code: "stamp-1", stage: 2, name: "Making history", description: "Earn a card history stamp", xp: 20, done: (s) => s.stamps >= 1 },
  { code: "clean-sheet", stage: 2, name: "Shut out", description: "Earn a clean-sheet stamp", xp: 20, done: (s) => s.cleanSheetStamps >= 1 },
  { code: "drop", stage: 2, name: "First signing", description: "Sign a player from a MATCHX drop", xp: 15, done: (s) => s.dropsSigned >= 1 },
  { code: "sale", stage: 2, name: "Done deal", description: "Sell a card on Transfers", xp: 20, done: (s) => s.sales >= 1 },
  { code: "purchase", stage: 2, name: "New signing", description: "Buy a card from another manager", xp: 20, done: (s) => s.purchases >= 1 },
  // Stage 3 · Matchday
  { code: "score-50", stage: 3, name: "Half century", description: "Score 50 points in a match", xp: 40, done: (s) => s.bestScore >= 50 },
  { code: "podium", stage: 3, name: "On the podium", description: "Finish top 3 in a match", xp: 40, done: (s) => s.podiums >= 1 },
  { code: "cards-100", stage: 3, name: "Deep bench", description: "Own 100 cards", xp: 50, done: (s) => s.cards >= 100 },
  { code: "binder-1", stage: 3, name: "Binder complete", description: "Complete a club binder", xp: 30, done: (s) => s.binders >= 1 },
  { code: "referral-1", stage: 3, name: "Bring a mate", description: "A friend joins with your link", xp: 30, done: (s) => s.referrals >= 1 },
  { code: "streak-7", stage: 3, name: "Every day", description: "Log in 7 days in a row", xp: 40, done: (s) => s.bestStreak >= 7 },
  { code: "predict-5", stage: 3, name: "Pundit", description: "Get 5 daily predictions right", xp: 40, done: (s) => s.predictionsRight >= 5 },
  // Stage 4 · Title race
  { code: "win", stage: 4, name: "Champions", description: "Win a match", xp: 75, done: (s) => s.wins >= 1 },
  { code: "entries-25", stage: 4, name: "Season ticket", description: "Enter 25 matches", xp: 75, done: (s) => s.entries >= 25 },
  { code: "gold-10", stage: 4, name: "Gold standard", description: "Own 10 Gold cards", xp: 50, done: (s) => s.golds >= 10 },
  { code: "stamps-10", stage: 4, name: "Storied squad", description: "Earn 10 card history stamps", xp: 75, done: (s) => s.stamps >= 10 },
  { code: "hat-trick", stage: 4, name: "Match ball", description: "Have a player score a hat-trick for you", xp: 50, done: (s) => s.hatTrickStamps >= 1 },
  { code: "captain-haul", stage: 4, name: "Captain fantastic", description: "Captain a 15+ point haul", xp: 50, done: (s) => s.captainHauls >= 1 },
  { code: "ruby", stage: 4, name: "Seeing red", description: "Own a Ruby card", xp: 50, done: (s) => s.rubies >= 1 },
  // Stage 5 · Legend
  { code: "wins-5", stage: 5, name: "Serial winner", description: "Win 5 matches", xp: 200, done: (s) => s.wins >= 5 },
  { code: "score-100", stage: 5, name: "Century", description: "Score 100 points in a match", xp: 150, done: (s) => s.bestScore >= 100 },
  { code: "entries-50", stage: 5, name: "Ever-present", description: "Enter 50 matches", xp: 150, done: (s) => s.entries >= 50 },
  { code: "binder-5", stage: 5, name: "Completionist", description: "Complete 5 club binders", xp: 100, done: (s) => s.binders >= 5 },
  { code: "diamond", stage: 5, name: "Ice cold", description: "Own a Diamond card", xp: 100, done: (s) => s.diamonds >= 1 },
  { code: "referral-5", stage: 5, name: "Scout", description: "5 friends join with your link", xp: 150, done: (s) => s.referrals >= 5 },
  { code: "streak-30", stage: 5, name: "Part of the furniture", description: "Log in 30 days in a row", xp: 150, done: (s) => s.bestStreak >= 30 },
  // Extras — any time
  { code: "founder", stage: null, name: "Founding member", description: "Join MATCHX as a founding member", xp: 25, done: (s) => s.founder },
  { code: "cards-25", stage: null, name: "Squad depth", description: "Own 25 cards", xp: 20, done: (s) => s.cards >= 25 },
  { code: "rainbow", stage: null, name: "One of one", description: "Own a Rainbow card", xp: 250, done: (s) => s.rainbows >= 1 },
];

/** The stage a manager is on: the first one whose achievements aren't all unlocked (6 = all done). */
export function currentStage(unlocked: Set<string>) {
  for (const st of STAGES) if (ACHIEVEMENTS.some((a) => a.stage === st.stage && !unlocked.has(a.code))) return st.stage as number;
  return STAGES.length + 1;
}
