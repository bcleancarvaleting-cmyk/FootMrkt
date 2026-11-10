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
}

export const STARTER_PACK_CODE = "football-starter";
export const WEEKLY_PACK_CODE = "football-weekly";

export const FOOTBALL_PACKS: PackSkuSeed[] = [
  {
    code: STARTER_PACK_CODE,
    version: 1,
    name: "Starter Pack",
    kind: "STARTER",
    priceMinor: 0,
    blurb: "11 players — a full squad of 7 starters and 4 subs. Free on registration. Locked and untradeable.",
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

/** Region packs (product request 10 Nov 2026): players only from English league clubs. Same odds as the base packs. */
FOOTBALL_PACKS.push(
  regional(byCode("football-bronze"), "football-eng-bronze", "England Bronze", "England", ["ENG"], "6 cards from English league clubs. Bronze, with a chance of a Silver."),
  regional(byCode("football-silver"), "football-eng-silver", "England Silver", "England", ["ENG"], "6 cards from English league clubs. Silver, with a chance of a Gold."),
  regional(byCode("football-gold"), "football-eng-gold", "England Gold", "England", ["ENG"], "6 cards from English clubs. At least 2 Premier League Golds — sometimes 3 or 4."),
);
