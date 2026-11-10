import type { PackConfig } from "@/domain/packs/config";

/**
 * Pack catalogue seed definitions (spec §5).
 *
 * STATUS: prices are PROPOSED (spec §18 "Regular pack prices"). Upgrade chances and the Gold-pack
 * minimum were APPROVED by the product owner on 9 Nov 2026. These are seeded into PackSku rows (versioned) and
 * every opening stores the exact config snapshot it used. Change a pack by publishing a
 * new version, never by editing an existing one.
 */
export interface PackSkuSeed {
  code: string;
  version: number;
  name: string;
  kind: "STARTER" | "WEEKLY" | "REGULAR";
  priceMinor: number;
  config: PackConfig;
  blurb: string;
  /** Shop grouping, e.g. "England". Packs without a region draw from every league. */
  region?: string;
  /** Leagues printed on the pack front, e.g. ["Premier League", "EFL", "National League"]. */
  leagues?: string[];
  /** Hidden from the shop (still grantable, e.g. by tests or old rewards). */
  hiddenInShop?: boolean;
}

export const STARTER_PACK_CODE = "football-starter";
export const WEEKLY_PACK_CODE = "football-weekly";

export const FOOTBALL_PACKS: PackSkuSeed[] = [
  {
    code: STARTER_PACK_CODE,
    // v2 (10 Nov 2026): 12 players — a starting seven, four subs and one extra.
    version: 2,
    name: "Starter Pack",
    kind: "STARTER",
    priceMinor: 0,
    blurb: "12 players — a starting seven, four subs and one extra. Free when you join. Untradeable.",
    config: {
      mode: "MINT",
      nonTradeable: true,
      uniquePlayers: true,
      // Approved 9 Nov 2026: ~30% chance per slot of Silver.
      // One Bronze slot is forced to a top-flight player ("lower-value Premier League player").
      topFlightRequirement: { count: 1, category: "BRONZE" },
      slots: [
        { label: "GK", count: 1, base: "BRONZE", filters: { positions: ["GK"] }, upgrades: [{ category: "SILVER", chanceBp: 3000 }] },
        { label: "DEF", count: 2, base: "BRONZE", filters: { positions: ["DEF"] }, upgrades: [{ category: "SILVER", chanceBp: 3000 }] },
        { label: "MID", count: 2, base: "BRONZE", filters: { positions: ["MID"] }, upgrades: [{ category: "SILVER", chanceBp: 3000 }] },
        { label: "ATT", count: 2, base: "BRONZE", filters: { positions: ["ATT"] }, upgrades: [{ category: "SILVER", chanceBp: 3000 }] },
        { label: "Sub DEF", count: 1, base: "BRONZE", filters: { positions: ["DEF"] }, upgrades: [{ category: "SILVER", chanceBp: 3000 }] },
        { label: "Sub MID", count: 1, base: "BRONZE", filters: { positions: ["MID"] }, upgrades: [{ category: "SILVER", chanceBp: 3000 }] },
        { label: "Sub ATT", count: 1, base: "BRONZE", filters: { positions: ["ATT"] }, upgrades: [{ category: "SILVER", chanceBp: 3000 }] },
        { label: "Sub GK", count: 1, base: "BRONZE", filters: { positions: ["GK"] }, upgrades: [] },
        { label: "Extra", count: 1, base: "BRONZE", upgrades: [{ category: "SILVER", chanceBp: 3000 }] },
      ],
    },
  },
  {
    code: WEEKLY_PACK_CODE,
    // v2: renamed "Free Pack" — now given out on admin-scheduled drop days (10 Nov 2026).
    version: 2,
    name: "Free Pack",
    kind: "WEEKLY",
    priceMinor: 0,
    blurb: "6 extra players, free on drop days. Untradeable — for building your squad.",
    // Product decision (9 Nov 2026): one free untradeable pack per manager per week. Cards are
    // minted fresh (they don't drain the tradeable supply) and can't be sold or used in sets.
    // Odds mirror the Bronze Pack (approved odds).
    config: {
      mode: "MINT",
      nonTradeable: true,
      uniquePlayers: true,
      slots: [
        { label: "DEF", count: 1, base: "BRONZE", filters: { positions: ["DEF"] }, upgrades: [] },
        { label: "MID", count: 1, base: "BRONZE", filters: { positions: ["MID"] }, upgrades: [] },
        { label: "ATT", count: 1, base: "BRONZE", filters: { positions: ["ATT"] }, upgrades: [] },
        { label: "Any", count: 2, base: "BRONZE", upgrades: [] },
        { label: "Any+", count: 1, base: "BRONZE", upgrades: [{ category: "SILVER", chanceBp: 2500 }] },
      ],
    },
  },
  {
    code: "football-bronze",
    version: 1,
    name: "Bronze Pack",
    kind: "REGULAR",
    priceMinor: 299,
    blurb: "6 cards. Bronze, with a chance of a Silver.",
    config: {
      mode: "POOL",
      nonTradeable: false,
      uniquePlayers: true,
      slots: [
        { label: "Bronze", count: 5, base: "BRONZE", upgrades: [] },
        { label: "Bronze+", count: 1, base: "BRONZE", upgrades: [{ category: "SILVER", chanceBp: 2500 }] },
      ],
    },
  },
  {
    code: "football-silver",
    version: 1,
    name: "Silver Pack",
    kind: "REGULAR",
    priceMinor: 599,
    blurb: "6 cards. Silver, with a chance of a Gold.",
    config: {
      mode: "POOL",
      nonTradeable: false,
      uniquePlayers: true,
      slots: [
        { label: "Silver", count: 5, base: "SILVER", upgrades: [] },
        { label: "Silver+", count: 1, base: "SILVER", upgrades: [{ category: "GOLD", chanceBp: 2000 }] },
      ],
    },
  },
  {
    code: "football-gold",
    // v2 (product decision 9 Nov 2026): 2 Golds is a hard minimum; a pack can contain 3 or 4
    // Golds, with the rest Bronze or Silver.
    version: 2,
    name: "Gold Pack",
    kind: "REGULAR",
    priceMinor: 999,
    blurb: "6 cards. At least 2 top-flight Golds — sometimes 3 or 4.",
    config: {
      mode: "POOL",
      nonTradeable: false,
      uniquePlayers: true,
      slots: [
        { label: "Gold", count: 2, base: "GOLD", filters: { topFlightOnly: true }, upgrades: [] },
        // Up to two extra Golds (approved odds).
        {
          label: "Wildcard",
          count: 2,
          base: "BRONZE",
          upgrades: [
            { category: "GOLD", chanceBp: 1500 },
            { category: "SILVER", chanceBp: 4000 },
          ],
        },
        { label: "Bronze+", count: 2, base: "BRONZE", upgrades: [{ category: "SILVER", chanceBp: 4000 }] },
      ],
    },
  },
];

/** Restrict every slot of a pack to clubs in the given league countries. */
function regional(base: PackSkuSeed, code: string, name: string, region: string, countries: string[], blurb: string): PackSkuSeed {
  return {
    ...base,
    code,
    version: 1,
    name,
    region,
    leagues: ["Premier League", "EFL", "National League"],
    hiddenInShop: false,
    blurb,
    config: {
      ...base.config,
      slots: base.config.slots.map((s) => ({
        ...s,
        filters: { ...s.filters, countries },
        upgrades: s.upgrades?.map((u) => ({ ...u, filters: { ...u.filters, countries } })),
      })),
    },
  };
}

const byCode = (c: string) => FOOTBALL_PACKS.find((p) => p.code === c)!;

// Product decision (10 Nov 2026): every league is English for now, so the all-leagues packs are
// hidden from the shop and the England packs are the line-up. Unhide them once other countries
// (Italy, France, …) are added.
for (const code of ["football-bronze", "football-silver", "football-gold"]) byCode(code).hiddenInShop = true;

/** Region packs (product request 10 Nov 2026): players only from English league clubs. Same odds as the base packs. */
FOOTBALL_PACKS.push(
  regional(byCode("football-bronze"), "football-eng-bronze", "England Bronze", "England", ["ENG"], "6 cards from English league clubs. Bronze, with a chance of a Silver."),
  regional(byCode("football-silver"), "football-eng-silver", "England Silver", "England", ["ENG"], "6 cards from English league clubs. Silver, with a chance of a Gold."),
  regional(byCode("football-gold"), "football-eng-gold", "England Gold", "England", ["ENG"], "6 cards from English clubs. At least 2 Premier League Golds — sometimes 3 or 4."),
);

/**
 * Default welcome gifts (product decision 10 Nov 2026), editable in Admin → Economy: after the Starter Pack, a
 * Silver pack 3 days after registering and one lucky Gold player 4 days after that (day 7).
 * Both are freshly minted and untradeable, so they never drain the tradeable supply.
 */
export const WELCOME_SILVER_CODE = "football-welcome-silver";
export const WELCOME_GOLD_CODE = "football-welcome-gold";

FOOTBALL_PACKS.push(
  {
    code: WELCOME_SILVER_CODE,
    version: 1,
    name: "Welcome Silver",
    kind: "WEEKLY",
    priceMinor: 0,
    hiddenInShop: true,
    blurb: "A welcome gift 3 days after you join: 6 Silver players, with a chance of a Gold. Untradeable.",
    config: {
      mode: "MINT",
      nonTradeable: true,
      uniquePlayers: true,
      slots: [
        { label: "Silver", count: 5, base: "SILVER", upgrades: [] },
        { label: "Silver+", count: 1, base: "SILVER", upgrades: [{ category: "GOLD", chanceBp: 2000 }] },
      ],
    },
  },
  {
    code: WELCOME_GOLD_CODE,
    version: 1,
    name: "Lucky Gold",
    kind: "WEEKLY",
    priceMinor: 0,
    hiddenInShop: true,
    blurb: "One lucky Gold player, a week after you join. Untradeable.",
    config: {
      mode: "MINT",
      nonTradeable: true,
      uniquePlayers: true,
      slots: [{ label: "Lucky Gold", count: 1, base: "GOLD", upgrades: [] }],
    },
  },
);

export const WELCOME_FOUR_CODE = "football-welcome-four";
export const WELCOME_MIX_CODE = "football-welcome-mix";
/** Choice of Gold: three Golds are offered and the manager keeps one (see src/server/picks.ts). */
export const GOLD_PICK_CODE = "football-gold-pick";
export const REFERRAL_PACK_CODE = "football-referral";
export const BRONZE_PICK_CODE = "football-bronze-pick";
export const SILVER_PICK_CODE = "football-silver-pick";
/** Packs opened through the pick screen (choose 1 of 3) rather than a normal reveal. */
export const PICK_CODES = [GOLD_PICK_CODE, SILVER_PICK_CODE, BRONZE_PICK_CODE] as const;

const free = (code: string, name: string, blurb: string, slots: PackSkuSeed["config"]["slots"]): PackSkuSeed => ({
  code,
  version: 1,
  name,
  kind: "WEEKLY",
  priceMinor: 0,
  hiddenInShop: true,
  blurb,
  config: { mode: "MINT", nonTradeable: true, uniquePlayers: true, slots },
});

/** Starter period packs (product decision 10 Nov 2026) and the refer-a-friend pack. All free and untradeable. */
FOOTBALL_PACKS.push(
  free(WELCOME_FOUR_CODE, "Squad Boost", "4 more players for your squad, 3 days after you join. Untradeable.", [
    { label: "Bronze", count: 3, base: "BRONZE", upgrades: [{ category: "SILVER", chanceBp: 2500 }] },
    { label: "Bronze+", count: 1, base: "BRONZE", upgrades: [{ category: "SILVER", chanceBp: 5000 }] },
  ]),
  free(WELCOME_MIX_CODE, "Mixed Pack", "A mix of Bronze, Silver and Gold. Untradeable.", [
    { label: "Bronze", count: 2, base: "BRONZE", upgrades: [] },
    { label: "Silver", count: 2, base: "SILVER", upgrades: [] },
    { label: "Gold", count: 1, base: "GOLD", upgrades: [] },
  ]),
  free(GOLD_PICK_CODE, "Choice of Gold", "Pick one of three Gold players to keep. Untradeable.", [{ label: "Gold", count: 1, base: "GOLD", upgrades: [] }]),
  free(REFERRAL_PACK_CODE, "Refer-a-Friend Pack", "3 players for every friend who joins and plays: usually 2 Bronze and a Silver, sometimes a Gold. Untradeable.", [
    { label: "Bronze", count: 2, base: "BRONZE", upgrades: [] },
    { label: "Bonus", count: 1, base: "SILVER", upgrades: [{ category: "GOLD", chanceBp: 1500 }] },
  ]),
);

/** When each welcome gift unlocks, counted from registration: the 4-week starter period. */
export const WELCOME_SCHEDULE = [
  { code: WELCOME_FOUR_CODE, afterDays: 3 },
  { code: WELCOME_GOLD_CODE, afterDays: 6 },
  { code: WELCOME_MIX_CODE, afterDays: 9 },
  { code: GOLD_PICK_CODE, afterDays: 12 },
] as const;

/** Gift versions (free, untradeable, minted) of the shop packs, and Bronze/Silver picks — for admin gifts. */
const giftOf = (code: string, name: string) => {
  const base = FOOTBALL_PACKS.find((p) => p.code === code)!;
  return free(`${code}-gift`, name, `${base.blurb} A gift from MATCHX — untradeable.`, base.config.slots);
};
FOOTBALL_PACKS.push(
  free(BRONZE_PICK_CODE, "Choice of Bronze", "Pick one of three Bronze players to keep. Untradeable.", [{ label: "Bronze", count: 1, base: "BRONZE", upgrades: [] }]),
  free(SILVER_PICK_CODE, "Choice of Silver", "Pick one of three Silver players to keep. Untradeable.", [{ label: "Silver", count: 1, base: "SILVER", upgrades: [] }]),
  giftOf("football-eng-bronze", "Gift: Bronze Pack"),
  giftOf("football-eng-silver", "Gift: Silver Pack"),
  giftOf("football-eng-gold", "Gift: Gold Pack"),
);
