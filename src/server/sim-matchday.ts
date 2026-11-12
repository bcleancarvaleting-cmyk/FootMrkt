import type { Prisma } from "@/generated/prisma/client";
import { SIMULATED_PROVIDER_NAME, simulateFixtures, simulateMatch, simulatedProvider } from "@/providers/football/simulated";
import type { ProviderMessage } from "@/providers/football/types";
import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";
import { DEADLINE_MINUTES, finaliseGameweek, footballSport, insertGameweek, lockGameweek, refreshProvisional } from "./gameweeks";
import { ingestMessages } from "./ingestion";
import { getText } from "./settings";

/**
 * Simulated matchdays (product decision 12 Nov 2026): a matchday of games between the real clubs,
 * clearly labelled SIM, whose results are generated from the players' real form and value and
 * play out live — kick-off, goals minute by minute, half time, full time — then settle like any
 * gameweek. Entrants know it's simulated. Simulated results never feed real-world stats: values,
 * Top performers, the form guide, Team of the Week and the Mega League only use real football.
 *
 * Timing from kick-off: 0–45 min first half, 45–60 half time, 60–105 second half, then full time.
 * Settled automatically a few minutes after the last game ends.
 */
const MIN = 60_000;
export const SIM_SEASON_SUFFIX = " SIM";

export async function simSeason() {
  const { currentSeason } = await import("./season");
  return `${await currentSeason()}${SIM_SEASON_SUFFIX}`;
}

/** Match minute at `now` for a game that kicked off at `ko`: null before kick-off, 90+ at full time. */
export function simMinute(ko: Date, now: Date): number | null {
  const e = (now.getTime() - ko.getTime()) / MIN;
  if (e < 0) return null;
  if (e < 45) return Math.max(1, Math.ceil(e));
  if (e < 60) return 45; // half time
  if (e < 105) return Math.min(89, Math.ceil(e - 15));
  return 90;
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

/** The admin form's default kick-off: 19:00 UK tonight, or tomorrow once it's past 17:00. */
export function suggestedSimKickoff(now: Date) {
  const d = new Date(now.getTime() + (now.getUTCHours() >= 17 ? 86_400_000 : 0));
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T19:00`;
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
export async function createSimMatchday(adminId: string | null, input: { kickoffAt: Date; copyFrom?: string | "latest" | null }, now = new Date()) {
  if (input.kickoffAt.getTime() < now.getTime() + 15 * MIN) throw new DomainError("TIME", "Pick a kick-off at least 15 minutes from now.");
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
  let copied = 0;
  if (input.copyFrom) {
    const src =
      input.copyFrom === "latest"
        ? await db.gameweek.findFirst({ where: { simulated: true, id: { not: gw.id }, competitions: { some: {} } }, orderBy: { startsAt: "desc" }, select: { id: true } })
        : { id: input.copyFrom };
    if (src) {
      const comps = await db.competition.findMany({ where: { gameweekId: src.id, status: { not: "CANCELLED" } } });
      const locksAt = new Date(input.kickoffAt.getTime() - DEADLINE_MINUTES * MIN);
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
  await audit(db, { actorId: adminId, action: "sim.create", entityType: "Gameweek", entityId: gw.id, after: { number, kickoffAt: input.kickoffAt, fixtures: fixtures.length, copied } });
  return { gameweekId: gw.id, number, fixtures: fixtures.length, copied };
}

/** How good each player is for the simulator: from their current £ value (1 = average). */
async function weights(playerIds: string[]) {
  if (!playerIds.length) return new Map<string, number>();
  const rows = await db.$queryRaw<Array<{ playerId: string; valueMp: number }>>`
    SELECT DISTINCT ON ("playerId") "playerId", "valueMp" FROM "MPValuation" WHERE "playerId" = ANY(${playerIds}::uuid[]) ORDER BY "playerId", "computedAt" DESC`;
  return new Map(rows.map((r) => [r.playerId, Math.min(2.5, Math.max(0.6, 0.6 + 0.45 * Math.log2(1 + Number(r.valueMp))))]));
}

/**
 * The scheduled job: play every simulated game that has kicked off up to the current minute, and
 * settle a simulated matchday once its games have finished.
 */
export async function playSimMatchdays(now = new Date()) {
  const gws = await db.gameweek.findMany({ where: { simulated: true, status: { not: "SETTLED" }, startsAt: { lte: now } }, select: { id: true, status: true } });
  const out = { played: 0, settled: 0 };
  for (const gw of gws) {
    const fixtures = await db.fixture.findMany({
      where: { gameweekId: gw.id, status: { in: ["SCHEDULED", "LIVE"] }, kickoffAt: { lte: now } },
      include: { homeClub: true, awayClub: true },
    });
    if (fixtures.length) {
      if (gw.status === "OPEN" || gw.status === "UPCOMING") await lockGameweek(gw.id, null);
      const players = await db.player.findMany({ where: { clubId: { in: fixtures.flatMap((f) => [f.homeClubId, f.awayClubId]) }, active: true }, select: { id: true, clubId: true, position: true, squadNumber: true, providerRefs: true } });
      const w = await weights(players.map((p) => p.id));
      const messages: ProviderMessage[] = [];
      for (const f of fixtures) {
        const squad = (clubId: string) =>
          players
            .filter((p) => p.clubId === clubId)
            .map((p) => ({ ref: (p.providerRefs as Record<string, string>)[SIMULATED_PROVIDER_NAME], clubRef: clubId, position: p.position, squadNumber: p.squadNumber, weight: w.get(p.id) ?? 1 }));
        messages.push(
          ...simulateMatch(
            { providerFixtureId: f.providerFixtureId, homeClubRef: f.homeClub.code, awayClubRef: f.awayClub.code, kickoffAt: f.kickoffAt },
            { club: { ref: f.homeClub.code, strengthHint: f.homeClub.simStrength }, squad: squad(f.homeClubId) },
            { club: { ref: f.awayClub.code, strengthHint: f.awayClub.simStrength }, squad: squad(f.awayClubId) },
            seedOf(f.providerFixtureId),
            { atMinute: simMinute(f.kickoffAt, now) ?? 0, noPostponements: true },
          ),
        );
      }
      await ingestMessages(simulatedProvider, messages);
      await db.gameweek.update({ where: { id: gw.id }, data: { status: "PROVISIONAL" } });
      await refreshProvisional(gw.id);
      out.played += fixtures.length;
    }
    // Every game over (5 minutes' grace): settle.
    const pending = await db.fixture.count({ where: { gameweekId: gw.id, status: { in: ["SCHEDULED", "LIVE"] } } });
    const last = await db.fixture.findFirst({ where: { gameweekId: gw.id }, orderBy: { kickoffAt: "desc" }, select: { kickoffAt: true } });
    if (!pending && last && now.getTime() >= last.kickoffAt.getTime() + 110 * MIN) {
      await finaliseGameweek(gw.id, null, now);
      out.settled++;
    }
  }
  return out;
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
