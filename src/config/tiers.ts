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
    default: // League One, League Two
      return "BRONZE";
  }
}

/**
 * Tier by market value — CONFIRMED by the product owner (9 Nov 2026):
 *   £20m and over → Gold · £2m up to £20m → Silver · under £2m → Bronze.
 * Values are whole pounds.
 */
export const VALUE_TIERS = { goldFromGbp: 20_000_000, silverFromGbp: 2_000_000 };

export function tierForValue(valueGbp: number, t = VALUE_TIERS): Category {
  return valueGbp >= t.goldFromGbp ? "GOLD" : valueGbp >= t.silverFromGbp ? "SILVER" : "BRONZE";
}

/**
 * Hard caps on how many copies of a card design can ever exist (launch caps, 10 Nov 2026).
 * A cap can safely be lowered later (never below what's issued) but raising one dilutes holders —
 * new supply should come from new-season designs instead.
 */
export const MAX_SUPPLY: Record<Category, number> = { GOLD: 500, SILVER: 1500, BRONZE: 3000 };
/** The most valuable Gold players are "elite": rarer still. Set at launch by migration. */
export const ELITE_GOLD = { count: 30, maxSupply: 250 };
/**
 * Special finishes on Gold cards — cosmetic only (they play, score and trade as the Gold).
 * At most this many of each, per Gold player, ever. Rarest first.
 *
 * Adding another special later (e.g. "Young Talent", icons, trendsetters) follows the same pattern:
 * a CardFinishKind value + a migration widening the serial check, an entry here, an odds setting,
 * a palette in components/finish-art.tsx and foil/face/halo styles in globals.css.
 */
export const FINISHES = {
  /** One of one: a single Rainbow per player, ever — and any tier can be it, Bronze included. */
  RAINBOW: { label: "Rainbow", perPlayer: 1, anyTier: true },
  DIAMOND: { label: "Diamond", perPlayer: 5, anyTier: false },
  RUBY: { label: "Ruby", perPlayer: 10, anyTier: false },
} as const;
export type FinishKind = keyof typeof FINISHES;
