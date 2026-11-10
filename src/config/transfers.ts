/**
 * Launch stock for the Transfer list (product request 10 Nov 2026): a mix of Gold, Silver and
 * Bronze from Haaland at 45 MP down to League Two / National League players from 1 MP. Admins
 * stock it with one click in Admin → Economy, and can edit these numbers any time.
 *
 * Within each band the best player (market value, else league level / first-team number / MP
 * value) gets the max price and prices curve down towards the min.
 */
export const LAUNCH_MIX = {
  days: 14,
  /** Named players at fixed prices (MP). */
  pinned: ["Haaland=45"],
  bands: [
    { tier: "GOLD", count: 20, minMp: 12, maxMp: 39.99, leagues: ["EPL"] },
    { tier: "SILVER", count: 15, minMp: 5, maxMp: 14.99, leagues: ["EPL"] },
    { tier: "SILVER", count: 15, minMp: 3, maxMp: 9.99, leagues: ["CHA"] },
    { tier: "BRONZE", count: 8, minMp: 2, maxMp: 4.99, leagues: ["EPL"] },
    { tier: "BRONZE", count: 10, minMp: 1.5, maxMp: 3.99, leagues: ["CHA"] },
    { tier: "BRONZE", count: 10, minMp: 1.25, maxMp: 2.99, leagues: ["LG1"] },
    { tier: "BRONZE", count: 10, minMp: 1, maxMp: 1.99, leagues: ["LG2"] },
    { tier: "BRONZE", count: 10, minMp: 1, maxMp: 1.49, leagues: ["NL"] },
  ],
} as const satisfies {
  days: number;
  pinned: readonly string[];
  bands: ReadonlyArray<{ tier: "GOLD" | "SILVER" | "BRONZE"; count: number; minMp: number; maxMp: number; leagues?: readonly string[] }>;
};
