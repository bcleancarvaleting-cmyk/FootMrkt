import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";

/**
 * Admin-editable settings (AppSetting table), with safe defaults and bounds. Every change is audited.
 */
export const SETTINGS = {
  xpPerMx: {
    label: "XP needed for 1 MX",
    help: "How much XP a manager swaps for 1 earned MX. Higher = slower. A typical manager earns roughly 100–200 XP a week.",
    default: 500,
    min: 50,
    max: 100_000,
  },
  diamondOneIn: {
    label: "Diamond chance: 1 in … Gold cards",
    help: "Each Gold card that comes out of a pack has a 1-in-this chance of being a Diamond (cosmetic only, max 5 per player, ever). Higher = rarer.",
    default: 200,
    min: 10,
    max: 1_000_000,
  },
  prizeFundSharePct: {
    label: "Prize fund share (%)",
    help: "Share of the last 7 days' card revenue suggested for next week's prizes. Admin-only.",
    default: 50,
    min: 0,
    max: 100,
  },
} as const;
export type SettingKey = keyof typeof SETTINGS;

export async function getSetting(key: SettingKey): Promise<number> {
  const row = await db.appSetting.findUnique({ where: { key } });
  const v = typeof row?.value === "number" ? row.value : SETTINGS[key].default;
  return Math.min(SETTINGS[key].max, Math.max(SETTINGS[key].min, v));
}

export async function allSettings() {
  const out = {} as Record<SettingKey, number>;
  for (const k of Object.keys(SETTINGS) as SettingKey[]) out[k] = await getSetting(k);
  return out;
}

export async function setSetting(adminId: string, key: SettingKey, value: number) {
  const def = SETTINGS[key];
  if (!def) throw new DomainError("UNKNOWN", "Unknown setting.");
  if (!Number.isFinite(value) || value < def.min || value > def.max) throw new DomainError("RANGE", `${def.label}: enter ${def.min}–${def.max}.`);
  const before = await getSetting(key);
  await db.appSetting.upsert({ where: { key }, create: { key, value, updatedBy: adminId }, update: { value, updatedBy: adminId } });
  await audit(db, { actorId: adminId, action: "setting.set", entityType: "AppSetting", entityId: key, before, after: value });
}

/** Text settings (links, choices). */
export const TEXT_SETTINGS = {
  facebookGroupUrl: {
    label: "Managers community link",
    help: "Your MATCHX Facebook group (or other community page). Shown on the homepage as 'Join the managers community'. Leave blank to hide it.",
    default: "",
  },
  whatsappChannelUrl: {
    label: "WhatsApp channel link",
    help: "Your MATCHX WhatsApp channel. Shown on the homepage as 'Join our WhatsApp channel'. Leave blank to hide it.",
    default: "",
  },
  referralRewardSku: {
    label: "Refer-a-friend reward",
    help: "The free pack a manager gets for each friend who joins with their link and plays a match.",
    default: "football-bronze-pick",
  },
} as const;
export type TextSettingKey = keyof typeof TEXT_SETTINGS;

export async function getText(key: TextSettingKey): Promise<string> {
  const row = await db.appSetting.findUnique({ where: { key } });
  return typeof row?.value === "string" ? row.value : TEXT_SETTINGS[key].default;
}

export async function setText(adminId: string, key: TextSettingKey, value: string) {
  if (!(key in TEXT_SETTINGS)) throw new DomainError("UNKNOWN", "Unknown setting.");
  const v = value.trim();
  if (key === "facebookGroupUrl" && v && !/^https:\/\/[^\s]+$/i.test(v)) {
    throw new DomainError("URL", "Paste the full link, starting https://, e.g. https://www.facebook.com/groups/matchx");
  }
  if (key === "whatsappChannelUrl" && v && !/^https:\/\/(www\.)?(whatsapp\.com\/channel\/|chat\.whatsapp\.com\/|wa\.me\/)[^\s]+$/i.test(v)) {
    throw new DomainError("URL", "Paste the WhatsApp channel link, e.g. https://whatsapp.com/channel/…");
  }
  if (key === "referralRewardSku") {
    const { FOOTBALL_PACKS } = await import("@/config/packs");
    if (!FOOTBALL_PACKS.some((p) => p.code === v && p.kind === "WEEKLY")) throw new DomainError("PACK", "Choose a free pack.");
  }
  const before = await getText(key);
  await db.appSetting.upsert({ where: { key }, create: { key, value: v, updatedBy: adminId }, update: { value: v, updatedBy: adminId } });
  await audit(db, { actorId: adminId, action: "setting.set", entityType: "AppSetting", entityId: key, before, after: v });
}

/** Name of the pack a manager earns per referral (shown on share and invite prompts). */
export async function referralRewardName() {
  const { FOOTBALL_PACKS } = await import("@/config/packs");
  const code = await getText("referralRewardSku");
  return FOOTBALL_PACKS.find((p) => p.code === code)?.name ?? "pack";
}
