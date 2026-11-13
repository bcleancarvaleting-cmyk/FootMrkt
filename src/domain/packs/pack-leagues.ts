import type { PackConfig, SlotFilters } from "./config";

/**
 * League logos on the England packs (product decision 13 Nov 2026):
 *   Gold (and Rare) → Premier League + Championship · Silver → all four · Bronze → League One + League Two.
 * A league is only shown while its players can really come out of that pack — e.g. League One and
 * League Two have no Silver cards, so the Silver pack shows the Premier League and Championship only.
 */
export const PACK_LEAGUES: Record<"gold" | "silver" | "bronze", string[]> = {
  gold: ["EPL", "CHA"],
  silver: ["EPL", "CHA", "LG1", "LG2"],
  bronze: ["LG1", "LG2"],
};

/** Packable stock: which categories each league has in packs right now. */
export interface LeagueStock {
  code: string;
  category: string;
  isTopFlight: boolean;
  tier: number;
  country: string;
}

export const tierOf = (code: string) => (code.includes("gold") || code.includes("rare") ? "gold" : code.includes("silver") ? "silver" : code.includes("bronze") ? "bronze" : null);

const matches = (s: LeagueStock, category: string, f: SlotFilters | undefined) =>
  s.category === category &&
  (!f?.topFlightOnly || s.isTopFlight) &&
  (!f?.countries?.length || f.countries.includes(s.country)) &&
  (!f?.leagueTiers?.length || f.leagueTiers.includes(s.tier));

/** League codes a pack can hand out, given what's packable now. */
export function leaguesInPack(config: PackConfig, stock: LeagueStock[]): Set<string> {
  const out = new Set<string>();
  for (const slot of config.slots) {
    const draws: Array<[string, SlotFilters | undefined]> = [[slot.base, slot.filters], ...(slot.upgrades ?? []).map((u) => [u.category, u.filters] as [string, SlotFilters | undefined])];
    for (const [category, f] of draws) for (const s of stock) if (matches(s, category, f)) out.add(s.code);
  }
  return out;
}

