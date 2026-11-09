import { FLAG_DEFINITIONS, type FlagKey, envDefault } from "@/config/flags";
import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";

/**
 * Legal-gated flags can only be switched on when the deployment explicitly records that the
 * gate has been cleared: LEGAL_GATES_CLEARED="PAID_PACKS,MARKET". This stops an admin UI click
 * from exposing unapproved paid/trading functionality (spec §9.3, §17).
 */
export function legalGateCleared(key: FlagKey): boolean {
  if (!FLAG_DEFINITIONS[key].legalGate) return true;
  const cleared = (process.env.LEGAL_GATES_CLEARED ?? "").split(",").map((s) => s.trim());
  return cleared.includes(key);
}

export async function isEnabled(key: FlagKey): Promise<boolean> {
  if (!legalGateCleared(key)) return false;
  const row = await db.featureFlag.findUnique({ where: { key } });
  return row ? row.enabled : envDefault(key);
}

export async function allFlags(): Promise<Record<FlagKey, boolean>> {
  const rows = await db.featureFlag.findMany();
  const out = {} as Record<FlagKey, boolean>;
  for (const key of Object.keys(FLAG_DEFINITIONS) as FlagKey[]) {
    const row = rows.find((r) => r.key === key);
    out[key] = legalGateCleared(key) && (row ? row.enabled : envDefault(key));
  }
  return out;
}

export async function setFlag(actorId: string, key: FlagKey, enabled: boolean) {
  if (enabled && !legalGateCleared(key)) {
    throw new DomainError("LEGAL_GATE", `${key} is legal-gated and cannot be enabled until the gate is cleared for this deployment.`);
  }
  await db.$transaction(async (tx) => {
    const before = await tx.featureFlag.findUnique({ where: { key } });
    await tx.featureFlag.upsert({ where: { key }, create: { key, enabled }, update: { enabled } });
    await audit(tx, { actorId, action: "flag.set", entityType: "FeatureFlag", entityId: key, before, after: { key, enabled } });
  });
}

export async function requireFlag(key: FlagKey) {
  if (!(await isEnabled(key))) throw new DomainError("FEATURE_DISABLED", "This feature is not available.");
}
