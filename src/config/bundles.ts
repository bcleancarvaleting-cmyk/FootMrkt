/**
 * MX top-up bundles (product decision 11 Nov 2026): £1 is roughly 1 MX, so pack and player prices
 * stay in line, and bigger bundles add bonus credit. Pitched against what things cost: a Gold pack is
 * £9.99, a Rare pack £19.99, and daily drops run from about 1 MX (Bronze) to 40+ MX (top Golds).
 * All MX bought (bonus included) is "bought credit": spendable on packs, drops and entries, never
 * withdrawable. Changing a bundle only affects new orders — each order stores its MX.
 */
export interface MxBundle {
  code: string;
  name: string;
  priceMinor: number; // £, in pence
  mxMinor: number; // MX credited, in hundredths
  note: string;
  best?: boolean;
}

export const MX_BUNDLES: MxBundle[] = [
  { code: "starter", name: "Starter", priceMinor: 499, mxMinor: 500, note: "A few Bronze and Silver drops" },
  { code: "squad", name: "Squad", priceMinor: 999, mxMinor: 1100, note: "A Gold pack, plus £1 spare" },
  { code: "club", name: "Club", priceMinor: 1999, mxMinor: 2300, note: "A Rare pack, plus £3 spare" },
  { code: "champion", name: "Champion", priceMinor: 3999, mxMinor: 5000, note: "Best value: 25% bonus credit", best: true },
];

export const bundleFor = (code: string) => MX_BUNDLES.find((b) => b.code === code);

/** Bonus as a percentage of the price, e.g. 10 for 11 MX at £9.99 (rounded). */
export const bonusPct = (b: MxBundle) => Math.round((b.mxMinor / b.priceMinor - 1) * 100);

/** The smallest bundle that covers a shortfall (or the biggest, if none does). */
export function bundleForShortfall(shortMinor: number) {
  return MX_BUNDLES.find((b) => b.mxMinor >= shortMinor) ?? MX_BUNDLES[MX_BUNDLES.length - 1];
}
