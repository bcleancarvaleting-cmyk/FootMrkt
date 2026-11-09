import type { Category } from "@/domain/packs/config";

/**
 * Which tier (Bronze / Silver / Gold) each real player's card is issued in.
 *
 * Fallback used only for players without a market value (see tierForValue below). It uses a
 * transparent proxy: league level plus squad number (1–11 are traditionally first-choice
 * numbers). It will misplace some players — admins can re-tier any player, and this should be
 * replaced by a data-driven rule (e.g. market value / minutes played) once a provider is chosen.
 */
export function tierFor(leagueTier: number, squadNumber: number | null): Category {
  const firstChoice = squadNumber !== null && squadNumber >= 1 && squadNumber <= 11;
  const squadRegular = squadNumber !== null && squadNumber <= 30;
  switch (leagueTier) {
    case 1: // Premier League
      return firstChoice ? "GOLD" : squadRegular ? "SILVER" : "BRONZE";
    case 2: // Championship
      return firstChoice ? "SILVER" : "BRONZE";
    default: // League One, League Two, National League
      return "BRONZE";
  }
}

/**
 * Tier by market value (product decision 9 Nov 2026: "based on transfer market pricing").
 * Thresholds are PROPOSED and easy to change. Values are whole pounds.
 */
export const VALUE_TIERS = { goldFromGbp: 20_000_000, silverFromGbp: 2_000_000 };

export function tierForValue(valueGbp: number, t = VALUE_TIERS): Category {
  return valueGbp >= t.goldFromGbp ? "GOLD" : valueGbp >= t.silverFromGbp ? "SILVER" : "BRONZE";
}

/** Hard caps on how many copies of a card design can ever exist. */
export const MAX_SUPPLY: Record<Category, number> = { GOLD: 40, SILVER: 120, BRONZE: 400 };
