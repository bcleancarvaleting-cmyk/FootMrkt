/**
 * Launch stock for the Transfer list (product request 10 Nov 2026): a mix of Gold, Silver and
 * Bronze from Haaland at 45 MX down to League Two players from 50p (0.50 MX). Admins
 * stock it with one click in Admin → Economy, and can edit these numbers any time.
 *
 * Within each band the best player (market value, else league level / first-team number / MX
 * value) gets the max price and prices curve down towards the min.
 */
export const LAUNCH_MIX = {
  days: 14,
  /** Named players at fixed prices (£). */
  pinned: ["Haaland=45"],
  bands: [
    { tier: "GOLD", count: 20, minMp: 12, maxMp: 39.99, leagues: ["EPL"] },
    { tier: "SILVER", count: 15, minMp: 5, maxMp: 14.99, leagues: ["EPL"] },
    { tier: "SILVER", count: 15, minMp: 3, maxMp: 9.99, leagues: ["CHA"] },
    // Bronze from 50p (product decision 10 Nov 2026): easy entry for pennies.
    { tier: "BRONZE", count: 8, minMp: 0.75, maxMp: 1.99, leagues: ["EPL"] },
    { tier: "BRONZE", count: 10, minMp: 0.6, maxMp: 1.49, leagues: ["CHA"] },
    { tier: "BRONZE", count: 10, minMp: 0.5, maxMp: 0.99, leagues: ["LG1"] },
    { tier: "BRONZE", count: 20, minMp: 0.5, maxMp: 0.75, leagues: ["LG2"] },
  ],
} as const satisfies {
  days: number;
  pinned: readonly string[];
  bands: ReadonlyArray<{ tier: "GOLD" | "SILVER" | "BRONZE"; count: number; minMp: number; maxMp: number; leagues?: readonly string[] }>;
};
