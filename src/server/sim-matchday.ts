import type { Prisma } from "@/generated/prisma/client";
import { SIMULATED_PROVIDER_NAME, type SimFeedEvent, simulateFixtures, simulateMatch, simulatedProvider } from "@/providers/football/simulated";
import type { ProviderMessage } from "@/providers/football/types";
import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";
import { DEADLINE_MINUTES, finaliseGameweek, footballSport, insertGameweek, lockGameweek, refreshProvisional } from "./gameweeks";
import { getText } from "./settings";

/**
 * Simulated matchdays (product decision 12 Nov 2026): a matchday of games between the real clubs,
 * clearly labelled SIM, whose results are generated from the players' real form and value and
 * play out live — kick-off, goals minute by minute, half time, full time — then settle like any
 * gameweek. Entrants know it's simulated. Simulated results never feed real-world stats: values,
 * Top performers, the form guide, Team of the Week and the Mega League only use real football.
 *
 * Two speeds. Quick (default): every game kicks off together and each half lasts 2 real minutes,
 * with 40 seconds of half time — the whole matchday is over in under 5 minutes, ticking forward
 * every few seconds while anyone is watching. Real time: 45-minute halves and a 15-minute break.
 * Settled automatically as soon as the last game ends.
 */
const MIN = 60_000;
export const SIM_SEASON_SUFFIX = " SIM";

export async function simSeason() {
  const { currentSeason } = await import("./season");
  return `${await currentSeason()}${SIM_SEASON_SUFFIX}`;
}

export const REAL_TIME_HALF = 45 * 60;
export const QUICK_HALF = 120;
export type SimSpeed = "quick" | "real";

/** Real seconds from kick-off to full time: two halves and a break a third as long. */
export const simDurationMs = (halfSeconds: number) => Math.round(halfSeconds * (2 + 1 / 3) * 1000);

/** Match minute at `now` for a game that kicked off at `ko`: null before kick-off, 45 at half time, 90 at full time. */
export function simMinute(ko: Date, now: Date, halfSeconds = REAL_TIME_HALF): number | null {
  const e = (now.getTime() - ko.getTime()) / 1000;
  const h = halfSeconds;
  const ht = h / 3;
  if (e < 0) return null;
  if (e < h) return Math.max(1, Math.ceil((e / h) * 45));
  if (e < h + ht) return 45; // half time
  if (e < 2 * h + ht) return Math.min(89, 45 + Math.ceil(((e - h - ht) / h) * 45));
  return 90;
}

/** The clock to show: "37'", "HT" or "FT". */
export function simClock(ko: Date, now: Date, halfSeconds = REAL_TIME_HALF): string | null {
  const e = (now.getTime() - ko.getTime()) / 1000;
  if (e < 0) return null;
  if (e >= halfSeconds && e < halfSeconds * (1 + 1 / 3)) return "HT";
  const m = simMinute(ko, now, halfSeconds)!;
  return m >= 90 ? "FT" : `${m}'`;
}

/** "2026-11-14T19:00" typed by an admin in the UK → the right instant (GMT or BST). */
export function ukLocalToDate(s: string): Date {
  const asUtc = new Date(`${s}${s.length === 16 ? ":00" : ""}Z`);
  if (Number.isNaN(asUtc.getTime())) throw new DomainError("TIME", "Pick a kick-off date and time.");
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(asUtc)
      .map((x) => [x.type, x.value]),
  );
  const shown = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(asUtc.getTime() - (shown - asUtc.getTime()));
}

/** The admin form's default kick-off: 10 minutes from now, on the next 5 minutes (UK time). */
export function suggestedSimKickoff(now: Date) {
  const step = 5 * MIN;
  const d = new Date(Math.ceil((now.getTime() + 10 * MIN) / step) * step);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Every player gets a stable simulator id (real players imported from a provider may not have one). */
async function ensureSimRefs() {
  await db.$executeRaw`
    UPDATE "Player" SET "providerRefs" = COALESCE("providerRefs", '{}'::jsonb) || jsonb_build_object(${SIMULATED_PROVIDER_NAME}::text, 'sim-' || id::text)
    WHERE NOT (COALESCE("providerRefs", '{}'::jsonb) ? ${SIMULATED_PROVIDER_NAME})`;
}

/**
 * Admin: create a simulated matchday kicking off at `kickoffAt` — every club in every league plays
 * once. With `copyFrom`, the matches from that simulated matchday (or the latest one) are copied
 * in, with the same names, rules, prizes and fees; otherwise it starts with none and the admin
 * adds them.
 */
export interface SimMatchSpec {
  name: string;
  tier?: "BRONZE" | "SILVER" | "GOLD";
  freeCardsOnly?: boolean;
  entryFeeMinor?: number;
  /** £ prizes, e.g. "1=10, 2-3=5". */
  prizes?: string;
  winnerPack?: "BRONZE" | "SILVER" | "GOLD";
}

/** Squads lock 1 minute before a simulated kick-off. */
export const SIM_LOCK_LEAD_MS = MIN;

export async function createSimMatchday(
  adminId: string | null,
  input: { kickoffAt: Date; copyFrom?: string | "latest" | null; speed?: SimSpeed; match?: SimMatchSpec | null },
  now = new Date(),
) {
  if (input.kickoffAt.getTime() < now.getTime() + 3 * MIN) throw new DomainError("TIME", "Pick a kick-off at least 3 minutes from now, so managers have time to pick a team.");
  await ensureSimRefs();
  const sport = await footballSport();
  const season = await simSeason();
  const number = ((await db.gameweek.findFirst({ where: { season }, orderBy: { number: "desc" }, select: { number: true } }))?.number ?? 0) + 1;
  const leagues = await db.league.findMany({ where: { sportId: sport.id }, include: { clubs: { select: { id: true, code: true, simStrength: true } } } });
  const key = `${season.replace(/\s+/g, "")}-${number}-${input.kickoffAt.getTime().toString(36)}`;
  const fixtures = simulateFixtures(
    leagues.map((l) => l.clubs.map((c) => ({ ref: c.code, strengthHint: c.simStrength }))),
    key,
    input.kickoffAt,
    Math.floor(input.kickoffAt.getTime() / MIN),
  );
  const clubByCode = new Map(leagues.flatMap((l) => l.clubs).map((c) => [c.code, c.id]));
  const gw = await insertGameweek({
    season,
    number,
    opensAt: now,
    actorId: adminId,
    provider: SIMULATED_PROVIDER_NAME,
    simulated: true,
    // Every game kicks off together, like a full Saturday 3pm.
    fixtures: fixtures.map((f) => ({ providerFixtureId: f.providerFixtureId, homeClubId: clubByCode.get(f.homeClubRef)!, awayClubId: clubByCode.get(f.awayClubRef)!, kickoffAt: input.kickoffAt })),
  });
  const halfSeconds = (input.speed ?? "quick") === "quick" ? QUICK_HALF : REAL_TIME_HALF;
  await db.gameweek.update({ where: { id: gw.id }, data: { simHalfSeconds: halfSeconds, endsAt: new Date(input.kickoffAt.getTime() + simDurationMs(halfSeconds)) } });
  let copied = 0;
  if (input.copyFrom) {
    const src =
      input.copyFrom === "latest"
        ? await db.gameweek.findFirst({ where: { simulated: true, id: { not: gw.id }, competitions: { some: {} } }, orderBy: { startsAt: "desc" }, select: { id: true } })
        : { id: input.copyFrom };
    if (src) {
      const comps = await db.competition.findMany({ where: { gameweekId: src.id, status: { not: "CANCELLED" } } });
      const locksAt = new Date(input.kickoffAt.getTime() - SIM_LOCK_LEAD_MS);
      for (const c of comps) {
        const base = c.name.replace(/ · (SIM|GW) ?\d+$/, "");
        const req = { ...((c.requirements ?? {}) as Record<string, unknown>) };
        delete req.clubs; // tied to the old fixtures
        await db.competition.create({
          data: {
            sportId: c.sportId,
            gameweekId: gw.id,
            code: `${key}-${base.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${copied}`,
            name: `${base} · SIM ${number}`,
            format: c.format,
            rosterRules: c.rosterRules,
            scoringRules: c.scoringRules,
            rewards: c.rewards as Prisma.InputJsonValue,
            requirements: req as Prisma.InputJsonValue,
            entryFeeMinor: c.entryFeeMinor,
            entryOpensAt: now,
            locksAt,
            status: "OPEN",
          },
        });
        copied++;
      }
    }
  }
  if (input.match?.name?.trim()) {
    const { createMatch } = await import("./competitions");
    try {
      await createMatch(adminId ?? "", { gameweekId: gw.id, ...input.match, name: input.match.name.trim() });
      copied++;
    } catch (e) {
      // A bad prize rule shouldn't leave a half-made matchday behind.
      await db.competition.deleteMany({ where: { gameweekId: gw.id } });
      await db.fixture.deleteMany({ where: { gameweekId: gw.id } });
      await db.gameweek.delete({ where: { id: gw.id } });
      throw e;
    }
  }
  await audit(db, { actorId: adminId, action: "sim.create", entityType: "Gameweek", entityId: gw.id, after: { number, kickoffAt: input.kickoffAt, fixtures: fixtures.length, copied } });
  return { gameweekId: gw.id, number, fixtures: fixtures.length, copied };
}

/** How good each player is for the simulator: from their current £ value (1 = average). */
async function weights(playerIds: string[], asOf: Date) {
  if (!playerIds.length) return new Map<string, number>();
  // Values as they stood at kick-off, so a revaluation mid-game can't change what already happened.
  const rows = await db.$queryRaw<Array<{ playerId: string; valueMp: number }>>`
    SELECT DISTINCT ON ("playerId") "playerId", "valueMp" FROM "MPValuation" WHERE "playerId" = ANY(${playerIds}::uuid[]) AND "computedAt" <= ${asOf} ORDER BY "playerId", "computedAt" DESC`;
  return new Map(rows.map((r) => [r.playerId, Math.min(2.5, Math.max(0.6, 0.6 + 0.45 * Math.log2(1 + Number(r.valueMp))))]));
}

/**
 * The scheduled job: play every simulated game that has kicked off up to the current minute, and
 * settle a simulated matchday once its games have finished.
 */
let running: Promise<{ played: number; settled: number }> | null = null;

export async function playSimMatchdays(now = new Date()) {
  // One runner at a time (the 5-minute job and live viewers can both trigger a tick): a caller that
  // arrives mid-run waits for that run instead of starting a second one.
  while (running) await running.catch(() => null);
  running = playOnce(now);
  try {
    return await running;
  } finally {
    running = null;
  }
}

async function playOnce(now: Date) {
  const out = { played: 0, settled: 0 };
  {
    const gws = await db.gameweek.findMany({ where: { simulated: true, status: { not: "SETTLED" }, startsAt: { lte: now } }, select: { id: true, status: true, simHalfSeconds: true } });
    for (const gw of gws) {
      const half = gw.simHalfSeconds ?? REAL_TIME_HALF;
      const fixtures = await db.fixture.findMany({
        where: { gameweekId: gw.id, status: { in: ["SCHEDULED", "LIVE"] }, kickoffAt: { lte: now } },
        include: { homeClub: true, awayClub: true },
      });
      if (fixtures.length) {
        if (gw.status === "OPEN" || gw.status === "UPCOMING") await lockGameweek(gw.id, null);
        const players = await db.player.findMany({
          where: { clubId: { in: fixtures.flatMap((f) => [f.homeClubId, f.awayClubId]) }, active: true },
          select: { id: true, displayName: true, clubId: true, position: true, squadNumber: true, providerRefs: true },
        });
        const w = await weights(players.map((p) => p.id), fixtures[0].kickoffAt);
        const byRef = new Map(players.map((p) => [(p.providerRefs as Record<string, string>)[SIMULATED_PROVIDER_NAME], p]));
        const messages: ProviderMessage[] = [];
        for (const f of fixtures) {
          const squad = (clubId: string) =>
            players
              .filter((p) => p.clubId === clubId)
              .map((p) => ({ ref: (p.providerRefs as Record<string, string>)[SIMULATED_PROVIDER_NAME], clubRef: clubId, position: p.position, squadNumber: p.squadNumber, weight: w.get(p.id) ?? 1 }));
          const feed: SimFeedEvent[] = [];
          messages.push(
            ...simulateMatch(
              { providerFixtureId: f.providerFixtureId, homeClubRef: f.homeClub.code, awayClubRef: f.awayClub.code, kickoffAt: f.kickoffAt },
              { club: { ref: f.homeClub.code, strengthHint: f.homeClub.simStrength }, squad: squad(f.homeClubId) },
              { club: { ref: f.awayClub.code, strengthHint: f.awayClub.simStrength }, squad: squad(f.awayClubId) },
              seedOf(f.providerFixtureId),
              { atMinute: simMinute(f.kickoffAt, now, half) ?? 0, noPostponements: true, feed, stepMinutes: 15 },
            ),
          );
          const events = feed.map((e) => ({
            minute: e.minute,
            type: e.type,
            side: e.side,
            player: byRef.get(e.player)?.displayName ?? "Unknown",
            playerId: byRef.get(e.player)?.id ?? null,
            ...(e.assist ? { assist: byRef.get(e.assist)?.displayName ?? null } : {}),
            ...(e.saved ? { saved: true } : {}),
          }));
          if (stable(events) !== stable(f.simEvents ?? [])) await db.fixture.update({ where: { id: f.id }, data: { simEvents: events as Prisma.InputJsonValue } });
        }
        await writeSimMessages(messages);
        await db.gameweek.update({ where: { id: gw.id }, data: { status: "PROVISIONAL" } });
        await refreshProvisional(gw.id);
        out.played += fixtures.length;
      }
      // Every game over: settle (a few seconds' grace on quick sims, 5 minutes in real time).
      const pending = await db.fixture.count({ where: { gameweekId: gw.id, status: { in: ["SCHEDULED", "LIVE"] } } });
      const last = await db.fixture.findFirst({ where: { gameweekId: gw.id }, orderBy: { kickoffAt: "desc" }, select: { kickoffAt: true } });
      const grace = half <= QUICK_HALF * 2 ? 5_000 : 5 * MIN;
      if (!pending && last && now.getTime() >= last.kickoffAt.getTime() + simDurationMs(half) + grace) {
        await finaliseGameweek(gw.id, null, now);
        out.settled++;
      }
    }
  }
  return out;
}

const stable = (v: unknown): string =>
  v && typeof v === "object" && !Array.isArray(v)
    ? `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
    : JSON.stringify(v);

/**
 * Write a simulated tick straight to fixtures and player stat lines — only what changed, in one
 * transaction. (Real provider data goes through ingestMessages, which keeps every raw message;
 * a quick sim would otherwise store thousands of near-identical messages every few seconds.)
 */
async function writeSimMessages(messages: ProviderMessage[]) {
  const refs = [...new Set(messages.map((m) => m.providerFixtureId))];
  const fixtures = await db.fixture.findMany({ where: { provider: SIMULATED_PROVIDER_NAME, providerFixtureId: { in: refs } } });
  const fixtureByRef = new Map(fixtures.map((f) => [f.providerFixtureId, f]));
  const playerRefs = [...new Set(messages.map((m) => m.playerRef).filter((r): r is string => !!r))];
  const players = playerRefs.length
    ? await db.$queryRaw<Array<{ id: string; ref: string }>>`
        SELECT id, "providerRefs"->>${SIMULATED_PROVIDER_NAME} AS ref FROM "Player" WHERE "providerRefs"->>${SIMULATED_PROVIDER_NAME} = ANY(${playerRefs}::text[])`
    : [];
  const playerByRef = new Map(players.map((p) => [p.ref, p.id]));
  const current = await db.playerMatchStat.findMany({ where: { fixtureId: { in: fixtures.map((f) => f.id) }, isCurrent: true }, select: { id: true, fixtureId: true, playerId: true, revision: true, stats: true } });
  const cur = new Map(current.map((c) => [`${c.fixtureId}:${c.playerId}`, c]));
  const retire: string[] = [];
  const create: Prisma.PlayerMatchStatCreateManyInput[] = [];
  const fixtureUpdates: Array<{ id: string; data: Prisma.FixtureUpdateInput }> = [];
  for (const msg of messages) {
    const fixture = fixtureByRef.get(msg.providerFixtureId);
    if (!fixture) continue;
    if (msg.kind === "FIXTURE_RESULT") {
      const r = simulatedProvider.normaliseFixture(msg.payload);
      const minute = r.status === "LIVE" && typeof msg.payload.minute === "number" ? msg.payload.minute : null;
      if (r.status !== fixture.status || r.homeGoals !== fixture.homeGoals || r.awayGoals !== fixture.awayGoals || minute !== fixture.minute) {
        const terminal = r.status === "FINISHED" || r.status === "POSTPONED" || r.status === "ABANDONED";
        fixtureUpdates.push({ id: fixture.id, data: { status: r.status, homeGoals: r.homeGoals, awayGoals: r.awayGoals, minute, finalisedAt: terminal ? new Date() : null } });
      }
      continue;
    }
    const playerId = msg.playerRef ? playerByRef.get(msg.playerRef) : undefined;
    if (!playerId) continue;
    const stats = simulatedProvider.normaliseStats(msg.payload);
    const prev = cur.get(`${fixture.id}:${playerId}`);
    if (prev && (prev.revision >= msg.revision || stable(prev.stats) === stable(stats))) continue;
    if (prev) retire.push(prev.id);
    create.push({ fixtureId: fixture.id, playerId, revision: msg.revision, isCurrent: true, stats: stats as unknown as Prisma.InputJsonValue, sourceEventId: msg.providerEventId });
  }
  if (!retire.length && !create.length && !fixtureUpdates.length) return;
  await db.$transaction([
    ...(retire.length ? [db.playerMatchStat.updateMany({ where: { id: { in: retire } }, data: { isCurrent: false } })] : []),
    ...(create.length ? [db.playerMatchStat.createMany({ data: create })] : []),
    ...fixtureUpdates.map((u) => db.fixture.update({ where: { id: u.id }, data: u.data })),
  ]);
}

let lastTick = 0;
/**
 * Called by live viewers (/api/live): moves any simulated matchday in play forward, at most every
 * 3 seconds per server. Cheap when nothing is on.
 */
export async function tickSims(now = new Date()) {
  if (now.getTime() - lastTick < 3_000) return;
  lastTick = now.getTime();
  const due = await db.gameweek.count({ where: { simulated: true, status: { not: "SETTLED" }, startsAt: { lte: now } } });
  if (due) await playSimMatchdays(now).catch(() => null);
}

function seedOf(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Optional daily simulated matchday (Admin → Settings → "Daily sim kick-off", e.g. 19:00 UK):
 * created each morning, copying the matches from the latest simulated matchday.
 */
export async function dailySimMatchday(now = new Date()) {
  const at = (await getText("simDailyTime")).trim();
  const m = /^(\d{2}):(\d{2})$/.exec(at);
  if (!m) return { skipped: "off" };
  const { ukMidnight } = await import("./admin-report");
  const today = ukMidnight(now);
  const kickoff = new Date(today.getTime() + (Number(m[1]) * 60 + Number(m[2])) * MIN);
  if (kickoff.getTime() < now.getTime() + 20 * MIN) return { skipped: "too late today" };
  const exists = await db.gameweek.findFirst({ where: { simulated: true, startsAt: { gte: today, lt: new Date(today.getTime() + 86_400_000) } } });
  if (exists) return { skipped: "already made" };
  return createSimMatchday(null, { kickoffAt: kickoff, copyFrom: "latest" }, now);
}
