import { setSportmonksTokenSource } from "@/providers/football/sportmonks";
import { audit } from "./audit";
import { db } from "./db";
import { readSecret } from "./secrets";

/**
 * Which football data provider is in use, and whether its key is available — from Admin →
 * Integrations (stored in the database), or from environment variables, which win when set.
 * Read through a short cache so the many synchronous checks stay cheap; call
 * `loadIntegrationState()` (async) before relying on them.
 */
const PROVIDER_KEY = "data.provider";
let state = { provider: process.env.DATA_PROVIDER ?? "", hasSportmonksToken: !!process.env.SPORTMONKS_API_TOKEN, at: 0 };

export const sportmonksToken = async () => process.env.SPORTMONKS_API_TOKEN || (await readSecret("sportmonks"));
setSportmonksTokenSource(sportmonksToken);

export async function loadIntegrationState(force = false) {
  if (!force && Date.now() - state.at < 30_000) return state;
  const row = await db.appSetting.findUnique({ where: { key: PROVIDER_KEY } }).catch(() => null);
  state = {
    provider: process.env.DATA_PROVIDER || (typeof row?.value === "string" ? row.value : ""),
    hasSportmonksToken: !!(await sportmonksToken()),
    at: Date.now(),
  };
  return state;
}

/** The provider switched on ("sportmonks", or "" for the development data). */
export const currentProvider = () => state.provider;
export const hasSportmonksToken = () => state.hasSportmonksToken;

export async function setDataProvider(provider: "sportmonks" | "", actorId: string | null) {
  await db.appSetting.upsert({ where: { key: PROVIDER_KEY }, create: { key: PROVIDER_KEY, value: provider, updatedBy: actorId }, update: { value: provider, updatedBy: actorId } });
  await audit(db, { actorId, action: "data.provider", entityType: "Setting", entityId: PROVIDER_KEY, after: { provider } });
  await loadIntegrationState(true);
}
