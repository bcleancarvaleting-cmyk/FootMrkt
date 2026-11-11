import type { Prisma } from "@/generated/prisma/client";
import { FOOTBALL_COMPETITION_TEMPLATES } from "@/config/competitions";
import {
  SIMULATED_PROVIDER_NAME,
  simulateCorrection,
  simulateFixtures,
  simulateMatch,
  simulatedProvider,
} from "@/providers/football/simulated";
import type { ProviderMessage } from "@/providers/football/types";
import { audit } from "./audit";
import { advanceCompetitionWindows, lockCompetition } from "./competitions";
import { db } from "./db";
import { DomainError } from "./errors";
import { isEnabled } from "./flags";
import { ingestMessages } from "./ingestion";
import { settleCompetition, updateProvisionalScores } from "./scoring";
import { revalueAll } from "./valuation";

/**
 * Gameweek lifecycle: create → OPEN (entries) → LOCKED (deadline) → PROVISIONAL (data arriving,
 * corrections allowed) → SETTLED (final scores, locks released, rewards).
 *
 * Fixture/stat data comes from the configured provider. Only the DEV simulated provider exists
 * today; the functions that use it refuse to run unless SIMULATED_DATA is enabled.
 */

/** Squads lock this many minutes before the first kick-off of the gameweek. */
export const DEADLINE_MINUTES = 10;

export async function footballSport() {
  return db.sport.findUniqueOrThrow({ where: { code: "football" } });
}

async function requireSimulator() {
  if (!(await isEnabled("SIMULATED_DATA"))) {
    throw new DomainError("NO_PROVIDER", "No licensed data provider is configured and simulated data is disabled.");
  }
}

function seedFrom(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export async function createGameweek(args: {
  season: string;
  number: number;
  opensAt: Date;
  /** First kick-off of the gameweek. Squads lock DEADLINE_MINUTES before the earliest fixture. */
  firstKickoffAt: Date;
  actorId: string | null;
}) {
  await requireSimulator();
  const sport = await footballSport();
  const leagues = await db.league.findMany({ where: { sportId: sport.id }, include: { clubs: true } });
  const key = `${args.season}-gw${args.number}`;
  const fixtures = simulateFixtures(
    leagues.map((l) => l.clubs.map((c) => ({ ref: c.code, strengthHint: c.simStrength }))),
    key,
    args.firstKickoffAt,
    seedFrom(key),
  );
  const clubByCode = new Map(leagues.flatMap((l) => l.clubs).map((c) => [c.code, c]));
  return insertGameweek({
    ...args,
    provider: SIMULATED_PROVIDER_NAME,
    fixtures: fixtures.map((f) => ({ providerFixtureId: f.providerFixtureId, homeClubId: clubByCode.get(f.homeClubRef)!.id, awayClubId: clubByCode.get(f.awayClubRef)!.id, kickoffAt: f.kickoffAt })),
  });
}

/** Create a gameweek with its fixtures and the standard competitions (shared by simulated and live data). */
export async function insertGameweek(args: {
  season: string;
  number: number;
  opensAt: Date;
  actorId: string | null;
  provider: string;
  fixtures: Array<{ providerFixtureId: string; homeClubId: string; awayClubId: string; kickoffAt: Date }>;
}) {
  if (!args.fixtures.length) throw new DomainError("NO_FIXTURES", "No fixtures found for that gameweek.");
  const sport = await footballSport();
  const devRewards = await isEnabled("DEV_TOOLS");
  const key = `${args.season}-gw${args.number}`;
  const fixtures = args.fixtures;
  // Product decision: the squad deadline is 10 minutes before the gameweek's first kick-off.
  const firstKickoff = new Date(Math.min(...fixtures.map((f) => f.kickoffAt.getTime())));
  const lastKickoff = new Date(Math.max(...fixtures.map((f) => f.kickoffAt.getTime())));
  const locksAt = new Date(firstKickoff.getTime() - DEADLINE_MINUTES * 60_000);

  const pools = await prizePools();
  return db.$transaction(async (tx) => {
    const gw = await tx.gameweek.create({
      data: {
        sportId: sport.id,
        season: args.season,
        number: args.number,
        startsAt: firstKickoff,
        endsAt: new Date(Math.max(firstKickoff.getTime() + 3 * 24 * 3600_000, lastKickoff.getTime() + 3 * 3600_000)),
        status: args.opensAt <= new Date() ? "OPEN" : "UPCOMING",
      },
    });
    await tx.fixture.createMany({
      data: fixtures.map((f) => ({ gameweekId: gw.id, provider: args.provider, ...f })),
    });
    for (const t of autoTemplates()) {
      await tx.competition.create({
        data: {
          sportId: sport.id,
          gameweekId: gw.id,
          code: `${key}-${t.key}`,
          name: `${t.name} · GW${args.number}`,
          format: t.format,
          rosterRules: t.rosterRules,
          scoringRules: t.scoringRules,
          rewards: [...(devRewards ? t.devRewards : t.rewards), ...(pools[t.key] ?? [])] as unknown as Prisma.InputJsonValue,
          requirements: (t.requirements ?? {}) as Prisma.InputJsonValue,
          entryOpensAt: args.opensAt,
          locksAt,
          status: args.opensAt <= new Date() ? "OPEN" : "UPCOMING",
        },
      });
    }
    await audit(tx, { actorId: args.actorId, action: "gameweek.create", entityType: "Gameweek", entityId: gw.id, after: { key, provider: args.provider, fixtures: fixtures.length } });
    return gw;
  });
}

/** Lock the gameweek now (deadline reached or admin fast-forward). */
export async function lockGameweek(gameweekId: string, actorId: string | null) {
  const comps = await db.competition.findMany({ where: { gameweekId, status: { in: ["UPCOMING", "OPEN"] } } });
  for (const c of comps) await lockCompetition(c.id, actorId);
  await db.gameweek.update({ where: { id: gameweekId }, data: { status: "LOCKED" } });
}

async function squadsFor(clubIds: string[]) {
  const players = await db.player.findMany({ where: { clubId: { in: clubIds }, active: true } });
  return players;
}

/**
 * DEV: play the next `count` scheduled fixtures (by kickoff) through the simulated provider and
 * ingest the results exactly as a live feed would be ingested.
 */
export async function simulateFixturesNow(gameweekId: string, count: number | "all", actorId: string | null) {
  await requireSimulator();
  const gw = await db.gameweek.findUniqueOrThrow({ where: { id: gameweekId } });
  if (gw.status === "OPEN" || gw.status === "UPCOMING") await lockGameweek(gameweekId, actorId);
  const pending = await db.fixture.findMany({
    where: { gameweekId, status: "SCHEDULED" },
    orderBy: [{ kickoffAt: "asc" }, { providerFixtureId: "asc" }],
    include: { homeClub: true, awayClub: true },
  });
  const batch = count === "all" ? pending : pending.slice(0, count);
  const players = await squadsFor(batch.flatMap((f) => [f.homeClubId, f.awayClubId]));
  const messages: ProviderMessage[] = [];
  for (const f of batch) {
    const squad = (clubId: string) =>
      players
        .filter((p) => p.clubId === clubId)
        .map((p) => ({ ref: (p.providerRefs as Record<string, string>)[SIMULATED_PROVIDER_NAME], clubRef: clubId, position: p.position, squadNumber: p.squadNumber }));
    messages.push(
      ...simulateMatch(
        { providerFixtureId: f.providerFixtureId, homeClubRef: f.homeClub.code, awayClubRef: f.awayClub.code, kickoffAt: f.kickoffAt },
        { club: { ref: f.homeClub.code, strengthHint: f.homeClub.simStrength }, squad: squad(f.homeClubId) },
        { club: { ref: f.awayClub.code, strengthHint: f.awayClub.simStrength }, squad: squad(f.awayClubId) },
        seedFrom(f.providerFixtureId),
      ),
    );
  }
  const report = await ingestMessages(simulatedProvider, messages);
  await db.gameweek.update({ where: { id: gameweekId }, data: { status: "PROVISIONAL" } });
  await refreshProvisional(gameweekId);
  return { fixtures: batch.length, ...report };
}

/** DEV: emit a provider stat correction for some finished fixtures, then rescore. */
export async function simulateCorrections(gameweekId: string, fixtures = 2) {
  await requireSimulator();
  const finished = await db.fixture.findMany({
    where: { gameweekId, status: "FINISHED" },
    orderBy: { providerFixtureId: "asc" },
    take: fixtures,
  });
  const messages: ProviderMessage[] = [];
  for (const f of finished) {
    const current = await db.playerMatchStat.findMany({ where: { fixtureId: f.id, isCurrent: true }, include: { player: true } });
    const asMessages: ProviderMessage[] = current.map((s) => {
      const ref = (s.player.providerRefs as Record<string, string>)[SIMULATED_PROVIDER_NAME];
      const line = s.stats as Record<string, number>;
      return {
        providerEventId: s.sourceEventId,
        kind: "PLAYER_STATS",
        providerFixtureId: f.providerFixtureId,
        playerRef: ref,
        revision: s.revision,
        payload: {
          mins_played: line.minutes, goals: line.goals, goal_assist: line.assists, pen_saves: line.penaltySaves,
          saves: line.saves, won_tackle: line.tackles, yellow_card: line.yellowCards, red_card: line.redCards,
          own_goals: line.ownGoals, pen_missed: line.penaltiesMissed, goals_conceded_on_pitch: line.goalsConceded,
        },
      };
    });
    messages.push(...simulateCorrection(asMessages, seedFrom(`${f.providerFixtureId}:corr:${Date.now()}`)));
  }
  const report = await ingestMessages(simulatedProvider, messages);
  await refreshProvisional(gameweekId);
  return report;
}

export async function refreshProvisional(gameweekId: string) {
  const comps = await db.competition.findMany({ where: { gameweekId, status: { in: ["LOCKED", "PROVISIONAL"] } } });
  for (const c of comps) await updateProvisionalScores(c.id);
}

/** Close the correction window: settle every competition, then revalue cards. */
export async function finaliseGameweek(gameweekId: string, actorId: string | null, valuationAt = new Date()) {
  const pending = await db.fixture.count({ where: { gameweekId, status: { in: ["SCHEDULED", "LIVE"] } } });
  if (pending) throw new DomainError("FIXTURES_PENDING", `${pending} fixture(s) still to be played.`);
  const comps = await db.competition.findMany({ where: { gameweekId, status: { in: ["LOCKED", "PROVISIONAL"] } } });
  for (const c of comps) await settleCompetition(c.id, actorId);
  await db.gameweek.update({ where: { id: gameweekId }, data: { status: "SETTLED" } });
  await revalueAll(valuationAt);
}

/** Scheduled job entry point. */
export async function runScheduledJobs() {
  const windows = await advanceCompetitionWindows();
  // Watchlist alerts for drops that have gone live, and settle finished daily predictions.
  const [{ announceLiveDrops }, { resolvePredictions }] = await Promise.all([import("./watchlist"), import("./predictions")]);
  await announceLiveDrops();
  await resolvePredictions();
  // Live football data (only when API_FOOTBALL_KEY is set).
  const { syncLiveData } = await import("./live-data");
  await syncLiveData().catch((e) => console.error("live data sync failed", e));
  await db.gameweek.updateMany({ where: { status: "UPCOMING", competitions: { some: { status: "OPEN" } } }, data: { status: "OPEN" } });
  await db.gameweek.updateMany({
    where: { status: "OPEN", competitions: { every: { status: { notIn: ["UPCOMING", "OPEN"] } } } },
    data: { status: "LOCKED" },
  });
  return windows;
}

export async function currentGameweek() {
  const sport = await footballSport();
  return (
    (await db.gameweek.findFirst({ where: { sportId: sport.id, status: { not: "SETTLED" } }, orderBy: [{ season: "asc" }, { number: "asc" }] })) ??
    (await db.gameweek.findFirst({ where: { sportId: sport.id }, orderBy: [{ season: "desc" }, { number: "desc" }] }))
  );
}

/**
 * Give every gameweek that's still open the full standard set of matches (e.g. the league matches
 * added after it was created). Idempotent: a match is only added if its code isn't there yet.
 */
export async function ensureStandardMatches() {
  const gws = await db.gameweek.findMany({ where: { status: { in: ["UPCOMING", "OPEN"] } }, include: { competitions: { select: { code: true, locksAt: true, entryOpensAt: true, status: true } } } });
  const devRewards = await isEnabled("DEV_TOOLS");
  const pools = await prizePools();
  let added = 0;
  for (const gw of gws) {
    const ref = gw.competitions[0];
    if (!ref) continue;
    const key = `${gw.season}-gw${gw.number}`;
    for (const t of autoTemplates()) {
      const code = `${key}-${t.key}`;
      if (gw.competitions.some((c) => c.code === code)) continue;
      await db.competition.createMany({
        data: [
          {
            sportId: gw.sportId,
            gameweekId: gw.id,
            code,
            name: `${t.name} · GW${gw.number}`,
            format: t.format,
            rosterRules: t.rosterRules,
            scoringRules: t.scoringRules,
            rewards: [...(devRewards ? t.devRewards : t.rewards), ...(pools[t.key] ?? [])] as unknown as Prisma.InputJsonValue,
            requirements: (t.requirements ?? {}) as Prisma.InputJsonValue,
            entryOpensAt: ref.entryOpensAt,
            locksAt: ref.locksAt,
            status: ref.entryOpensAt <= new Date() ? "OPEN" : "UPCOMING",
          },
        ],
        skipDuplicates: true,
      });
      added++;
    }
  }
  return added;
}

/** Each tier cup's weekly £ prize pool from Admin → Settings, as reward rules by template key. */
async function prizePools() {
  const { getText } = await import("./settings");
  const { parsePrizes } = await import("./competitions");
  const out: Record<string, Array<{ rankFrom: number; rankTo: number; cashMinor: number }>> = {};
  for (const t of FOOTBALL_COMPETITION_TEMPLATES) if (t.prizePool) out[t.key] = parsePrizes(await getText(t.prizePool));
  return out;
}

/**
 * Matches are set up by the admin, one by one (product decision 11 Nov 2026): no gameweek gets any
 * automatically. AUTO_MATCHES=true brings back the old standard set (the test suite uses it).
 */
function autoTemplates() {
  return process.env.AUTO_MATCHES === "true" ? FOOTBALL_COMPETITION_TEMPLATES : [];
}

/**
 * Admin: delete a gameweek nobody is using (no matches in it and no fixture played yet) — e.g. one
 * created by mistake. Its fixtures go with it; real ones come back if the week is created again.
 */
export async function deleteGameweek(adminId: string, gameweekId: string) {
  await db.$transaction(async (tx) => {
    const gw = await tx.gameweek.findUnique({ where: { id: gameweekId }, include: { _count: { select: { competitions: true } }, fixtures: { select: { id: true, status: true } } } });
    if (!gw) throw new DomainError("NOT_FOUND", "Gameweek not found.");
    if (gw._count.competitions) throw new DomainError("IN_USE", `GW${gw.number} has matches in it — delete or cancel those first.`);
    if (gw.fixtures.some((f) => f.status !== "SCHEDULED")) throw new DomainError("IN_USE", `GW${gw.number} has fixtures that have started or been played, so it can't be deleted.`);
    const ids = gw.fixtures.map((f) => f.id);
    await tx.playerMatchStat.deleteMany({ where: { fixtureId: { in: ids } } });
    await tx.fixture.deleteMany({ where: { id: { in: ids } } });
    await tx.gameweek.delete({ where: { id: gw.id } });
    await audit(tx, { actorId: adminId, action: "gameweek.delete", entityType: "Gameweek", entityId: gw.id, after: { number: gw.number, season: gw.season, fixtures: ids.length } });
  }).catch((e) => {
    if (e instanceof DomainError) throw e;
    throw new DomainError("IN_USE", "This gameweek is linked to other records (e.g. a daily prediction), so it can't be deleted.");
  });
}
