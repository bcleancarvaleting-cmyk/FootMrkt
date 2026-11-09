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
    description: "Transfer Market: list and buy cards between users. Blocked until legal approval.",
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
