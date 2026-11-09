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
  locksAt: Date;
  actorId: string | null;
}) {
  await requireSimulator();
  const sport = await footballSport();
  const devRewards = await isEnabled("DEV_TOOLS");
  const leagues = await db.league.findMany({ where: { sportId: sport.id }, include: { clubs: true } });
  const key = `${args.season}-gw${args.number}`;
  const fixtures = simulateFixtures(
    leagues.map((l) => l.clubs.map((c) => ({ ref: c.code, strengthHint: c.simStrength }))),
    key,
    new Date(args.locksAt.getTime() + 3600_000),
    seedFrom(key),
  );
  const clubByCode = new Map(leagues.flatMap((l) => l.clubs).map((c) => [c.code, c]));

  return db.$transaction(async (tx) => {
    const gw = await tx.gameweek.create({
      data: {
        sportId: sport.id,
        season: args.season,
        number: args.number,
        startsAt: args.locksAt,
        endsAt: new Date(args.locksAt.getTime() + 3 * 24 * 3600_000),
        status: args.opensAt <= new Date() ? "OPEN" : "UPCOMING",
      },
    });
    await tx.fixture.createMany({
      data: fixtures.map((f) => ({
        gameweekId: gw.id,
        provider: SIMULATED_PROVIDER_NAME,
        providerFixtureId: f.providerFixtureId,
        homeClubId: clubByCode.get(f.homeClubRef)!.id,
        awayClubId: clubByCode.get(f.awayClubRef)!.id,
        kickoffAt: f.kickoffAt,
      })),
    });
    for (const t of FOOTBALL_COMPETITION_TEMPLATES) {
      await tx.competition.create({
        data: {
          sportId: sport.id,
          gameweekId: gw.id,
          code: `${key}-${t.key}`,
          name: `${t.name} · GW${args.number}`,
          format: t.format,
          rosterRules: t.rosterRules,
          scoringRules: t.scoringRules,
          rewards: (devRewards ? t.devRewards : t.rewards) as unknown as Prisma.InputJsonValue,
          entryOpensAt: args.opensAt,
          locksAt: args.locksAt,
          status: args.opensAt <= new Date() ? "OPEN" : "UPCOMING",
        },
      });
    }
    await audit(tx, { actorId: args.actorId, action: "gameweek.create", entityType: "Gameweek", entityId: gw.id, after: { key, fixtures: fixtures.length } });
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
