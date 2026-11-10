/**
 * Feature flags (spec §13). Defaults come from env; admins can override at runtime (stored
 * in FeatureFlag, every change audited). Legal-gated features default OFF and must stay off
 * until legal/payment-provider approval (spec §9.3, §17 last acceptance test).
 */
export const FLAG_DEFINITIONS = {
  PAID_PACKS: {
    env: "FLAG_PAID_PACKS",
    default: false,
    legalGate: true,
    description: "Buy packs with real money. Blocked until UK legal + payment-provider review is complete.",
  },
  MARKET: {
    env: "FLAG_MARKET",
    default: false,
    legalGate: true,
    description: "Transfers: P2P trading in MX (5% fee) and house auctions. Blocked until legal approval.",
  },
  DEPOSITS: {
    env: "FLAG_DEPOSITS",
    default: false,
    legalGate: true,
    description: "Add funds: managers top up MX by card. Needs payment-provider approval and UK legal sign-off.",
  },
  WITHDRAWALS: {
    env: "FLAG_WITHDRAWALS",
    default: false,
    legalGate: true,
    description: "Withdraw cash MX to a bank account (minimum £10). Needs legal sign-off, KYC/AML and payout approval.",
  },
  PAID_ENTRY: {
    env: "FLAG_PAID_ENTRY",
    default: false,
    legalGate: true,
    description: "Charge MX entry fees for matches with prizes. Needs legal sign-off (prize competitions / pool betting).",
  },
  BETA: {
    env: "FLAG_BETA",
    default: true,
    legalGate: false,
    description: "Beta: shows a Beta tag and 'Coming soon' for paid packs, adding funds and auctions until each is switched on.",
  },
  PACK_SHOP: {
    env: "FLAG_PACK_SHOP",
    default: false,
    legalGate: false,
    description: "Pack shop: buy packs with MX (and by card once Paid packs is cleared). Shown as 'Coming soon' while off; free packs still arrive.",
  },
  AUCTIONS: {
    env: "FLAG_AUCTIONS",
    default: false,
    legalGate: false,
    description: "House auctions open for bidding (also needs Transfers/MARKET). Shown as 'Coming soon' while off.",
  },
  FOUNDING_SIGNUPS: {
    env: "FLAG_FOUNDING_SIGNUPS",
    default: true,
    legalGate: false,
    description: "New sign-ups become numbered Founding Members (badge kept forever). Switch off when the founding period ends.",
  },
  DEV_TOOLS: {
    env: "FLAG_DEV_TOOLS",
    default: process.env.NODE_ENV !== "production",
    legalGate: false,
    description: "Dev helpers: free dev packs, simulated match data, gameweek fast-forward.",
  },
  SIMULATED_DATA: {
    env: "FLAG_SIMULATED_DATA",
    default: process.env.NODE_ENV !== "production",
    legalGate: false,
    description: "Use the simulated football data provider. Must be OFF once a licensed provider is connected.",
  },
} as const;

export type FlagKey = keyof typeof FLAG_DEFINITIONS;

export function envDefault(key: FlagKey): boolean {
  const def = FLAG_DEFINITIONS[key];
  const raw = process.env[def.env];
  if (raw === undefined || raw === "") return def.default;
  return raw === "1" || raw.toLowerCase() === "true";
}
