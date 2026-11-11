import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";
import { setDataProvider } from "./integrations";
import { reportError } from "./monitoring";

/**
 * Admin → Integrations → "Rebuild from Sportmonks": replace a test site's starter data with the
 * real 92 squads and this season's real matches, then switch data to Sportmonks.
 *
 * Safe by design: everything is downloaded from Sportmonks first and nothing is touched if that
 * fails; it refuses once a real card payment exists or there are more than 50 player accounts;
 * saved keys and settings are kept. Runs in the background (several minutes); progress is stored
 * so the admin page can show it. Everyone is logged out — the admin logs in again with the
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD account.
 */
const STATUS_KEY = "rebuild.status";
/** When this server process started: a rebuild runs inside it, so one started earlier was cut off by a restart. */
const BOOTED_AT = Date.now();
const MAX_PLAYERS = 50;
export type RebuildStatus = { state: "idle" | "running" | "done" | "failed"; startedAt?: string; finishedAt?: string; log: string[]; error?: string };

export async function rebuildStatus(): Promise<RebuildStatus> {
  const row = await db.appSetting.findUnique({ where: { key: STATUS_KEY } });
  const s = (row?.value as RebuildStatus | undefined) ?? { state: "idle", log: [] };
  // A run that died with the server (a restart or redeploy) shows as failed, so it can be run again.
  if (s.state === "running" && s.startedAt && (Date.parse(s.startedAt) < BOOTED_AT || Date.now() - Date.parse(s.startedAt) > 3600_000))
    return { ...s, state: "failed", error: "Interrupted — the server restarted. Run it again." };
  return s;
}

async function save(s: RebuildStatus) {
  const value = { ...s, log: s.log.slice(-40) };
  await db.appSetting.upsert({ where: { key: STATUS_KEY }, create: { key: STATUS_KEY, value }, update: { value } });
}

/** Why a rebuild isn't allowed right now, or null. */
export async function rebuildBlocker() {
  const [paid, players, s] = await Promise.all([
    db.order.count({ where: { status: { in: ["PAID", "REFUNDED"] }, provider: { not: "sandbox" } } }),
    db.user.count({ where: { role: { not: "ADMIN" } } }),
    rebuildStatus(),
  ]);
  if (s.state === "running") return "A rebuild is already running.";
  if (paid > 0) return "This site has real card payments, so it can't be rebuilt. (Rebuilding is for test sites.)";
  if (players > MAX_PLAYERS) return `This site has ${players} player accounts, so it can't be rebuilt. (Rebuilding is for test sites.)`;
  return null;
}

/** Start checks; returns at once. The caller runs `runRebuild` in the background. */
export async function startRebuild(actorId: string) {
  const blocker = await rebuildBlocker();
  if (blocker) throw new DomainError("NOT_ALLOWED", blocker);
  await save({ state: "running", startedAt: new Date().toISOString(), log: ["Starting…"] });
  await audit(db, { actorId, action: "rebuild.start", entityType: "Database", entityId: "game" });
}

export async function runRebuild(actorId: string | null, sanity = { minClubs: 80, minPlayers: 1500 }) {
  const status: RebuildStatus = { state: "running", startedAt: new Date().toISOString(), log: [] };
  let last = 0;
  const log = async (m: string) => {
    status.log.push(m);
    if (Date.now() - last > 2000) {
      last = Date.now();
      await save(status).catch(() => {});
    }
  };
  try {
    await log("Downloading the 92 squads from Sportmonks…");
    const { buildSportmonksData } = await import("./sportmonks-data");
    const data = await buildSportmonksData((m) => void log(m));
    const players = data.leagues.reduce((n, l) => n + l.clubs.reduce((k, c) => k + c.players.length, 0), 0);
    if (data.leagues.reduce((n, l) => n + l.clubs.length, 0) < sanity.minClubs || players < sanity.minPlayers) {
      throw new Error(`Sportmonks returned too little (${players} players) — nothing was changed.`);
    }
    await log("Clearing the old game data (keys and settings are kept)…");
    const tables = await db.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'AppSetting')`;
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename.replace(/"/g, "")}"`).join(", ")} RESTART IDENTITY CASCADE`);
    const { ensureAdmin, seedWorld } = await import("./seed-world");
    // The admin account comes back first, so you can log in while the rest loads.
    await log(`Admin account restored: ${await ensureAdmin()} — you can log back in now`);
    await log("Building the game: clubs, players, cards, packs and this season's real matches…");
    await seedWorld(data, { realHistory: true, log: (m) => void log(m) });
    await setDataProvider("sportmonks", null);
    status.state = "done";
    status.finishedAt = new Date().toISOString();
    status.log.push("Done. Data is now powered by Sportmonks. Log in again with the admin account.");
    await save(status);
    await audit(db, { actorId: null, action: "rebuild.done", entityType: "Database", entityId: "game", after: { players, by: actorId } });
  } catch (e) {
    status.state = "failed";
    status.finishedAt = new Date().toISOString();
    status.error = e instanceof Error ? e.message : String(e);
    await save(status).catch(() => {});
    await reportError("Rebuild from Sportmonks failed", e);
  }
}
