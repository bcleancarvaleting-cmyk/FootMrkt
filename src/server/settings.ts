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
