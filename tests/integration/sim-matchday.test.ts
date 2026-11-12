import { beforeEach, describe, expect, it } from "vitest";
import { submitEntry } from "@/server/competitions";
import { db } from "@/server/db";
import { createGameweek } from "@/server/gameweeks";
import { openPack } from "@/server/packs";
import { createSimMatchday, playSimMatchdays, simAt, simPlan, ukLocalToDate } from "@/server/sim-matchday";
import { performanceTable } from "@/server/top-performers";
import { pickTeamOfTheWeek } from "@/server/totw";
import { buildWorld, makeUser, resetDb } from "./fixtures";

const MIN = 60_000;

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("simulated matchdays", () => {
  it("short games by default: 5-minute halves, a 10-second break and added time", () => {
    const ko = new Date("2026-11-14T19:00:00Z");
    const plan = simPlan("gw-1", undefined);
    expect(plan.half).toBe(300);
    expect(plan.brk).toBe(10);
    expect(plan.added1).toBeGreaterThanOrEqual(1);
    expect(plan.added1).toBeLessThanOrEqual(4);
    expect(plan.added2).toBeGreaterThanOrEqual(3);
    expect(plan.added2).toBeLessThanOrEqual(7);
    expect(simPlan("gw-1", null)).toEqual(plan); // fixed per matchday
    const at = (sec: number) => simAt(plan, ko, new Date(ko.getTime() + sec * 1000));
    expect(at(-1).clock).toBeNull();
    expect(at(150)).toMatchObject({ minute: 23, clock: "23'" });
    expect(at(300.5)).toMatchObject({ minute: 45, clock: "45+1'", added: plan.added1 });
    expect(at(plan.firstEnd + 5).clock).toBe("HT");
    expect(at(plan.secondStart + 150)).toMatchObject({ clock: "68'" });
    expect(at(plan.secondStart + 300.5)).toMatchObject({ minute: 89, clock: "90+1'", added: plan.added2 });
    expect(at(plan.end + 1)).toMatchObject({ minute: 90, clock: "FT" });
    // Real time is still available: 45-minute halves.
    const real = simPlan("gw-1", 2700);
    expect(simAt(real, ko, new Date(ko.getTime() + 30 * MIN)).clock).toBe("30'");
  });

  it("reads admin times as UK time, GMT or BST", () => {
    expect(ukLocalToDate("2026-12-01T19:00").toISOString()).toBe("2026-12-01T19:00:00.000Z");
    expect(ukLocalToDate("2026-07-01T19:00").toISOString()).toBe("2026-07-01T18:00:00.000Z");
  });

  it("creates a SIM matchday where every club plays once, and copies the last sim day's matches", async () => {
    const now = new Date();
    const ko = new Date(now.getTime() + 60 * MIN);
    await expect(createSimMatchday(null, { kickoffAt: new Date(now.getTime() + 2 * MIN) }, now)).rejects.toThrow();
    const first = await createSimMatchday(null, { kickoffAt: ko, speed: "real" }, now);
    expect(first.number).toBe(1);
    expect(first.fixtures).toBe(2); // 2 leagues × 2 clubs
    const gw = await db.gameweek.findUniqueOrThrow({ where: { id: first.gameweekId }, include: { fixtures: true } });
    expect(gw.simulated).toBe(true);
    expect(gw.season.endsWith(" SIM")).toBe(true);
    expect(gw.fixtures.every((f) => f.kickoffAt.getTime() === ko.getTime())).toBe(true);

    const sport = await db.sport.findFirstOrThrow();
    await db.competition.create({
      data: { sportId: sport.id, gameweekId: gw.id, code: "sim-night", name: "Sim Night · SIM 1", format: "OPEN", rosterRules: "football-7plus1-v4", scoringRules: "football-v1", rewards: [], requirements: { clubs: ["C00"], minLeagues: 1 }, entryFeeMinor: 0, entryOpensAt: now, locksAt: ko, status: "OPEN" },
    });
    const second = await createSimMatchday(null, { kickoffAt: new Date(ko.getTime() + 86_400_000), copyFrom: "latest" }, now);
    expect(second.number).toBe(2);
    expect(second.copied).toBe(1);
    const copy = await db.competition.findFirstOrThrow({ where: { gameweekId: second.gameweekId } });
    expect(copy.name).toBe("Sim Night · SIM 2");
    expect((copy.requirements as Record<string, unknown>).clubs).toBeUndefined();
    expect((copy.requirements as Record<string, unknown>).minLeagues).toBe(1);
  });

  it("plays out live minute by minute, settles after full time, and never touches real stats", async () => {
    const now = new Date();
    const ko = new Date(now.getTime() + 20 * MIN);
    const { gameweekId } = await createSimMatchday(null, { kickoffAt: ko, speed: "real" }, now);
    const at = (m: number) => new Date(ko.getTime() + m * MIN);
    const goals = async () => (await db.fixture.findMany({ where: { gameweekId }, orderBy: { providerFixtureId: "asc" } })).map((f) => [f.status, (f.homeGoals ?? 0) + (f.awayGoals ?? 0)] as const);

    expect((await playSimMatchdays(at(-1))).played).toBe(0); // not kicked off
    await playSimMatchdays(at(20));
    const mid = await goals();
    expect(mid.every(([s]) => s === "LIVE")).toBe(true);
    expect((await db.gameweek.findUniqueOrThrow({ where: { id: gameweekId } })).status).toBe("PROVISIONAL");

    const endMin = simPlan(gameweekId, 2700).end / 60;
    await playSimMatchdays(at(endMin + 0.1));
    const ft = await goals();
    expect(ft.every(([s]) => s === "FINISHED")).toBe(true);
    ft.forEach(([, g], i) => expect(g).toBeGreaterThanOrEqual(mid[i][1])); // goals only ever go up
    expect((await db.gameweek.findUniqueOrThrow({ where: { id: gameweekId } })).status).toBe("PROVISIONAL");

    await playSimMatchdays(at(endMin + 6));
    expect((await db.gameweek.findUniqueOrThrow({ where: { id: gameweekId } })).status).toBe("SETTLED");

    // Simulated results stay out of real-world stats.
    expect(await performanceTable({ window: "last" })).toHaveLength(0);
    expect((await pickTeamOfTheWeek(at(endMin + 7))).picked).toHaveLength(0);
  });

  it("quick sims: managers enter with cards already in a real squad, watch a live feed, and get paid out in ~5 minutes", async () => {
    const now = new Date();
    const admin = await makeUser("simadmin");
    // A real gameweek squad holding the manager's cards.
    const real = await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3 * 86_400_000), actorId: null });
    const a = await makeUser("simplayer");
    const res = await openPack(a.userId, a.starterEntitlementId!);
    const cards = await db.cardInstance.findMany({ where: { id: { in: res.cards.map((c) => c.cardId) } }, include: { template: { include: { player: true } } } });
    const by = (p: string) => cards.filter((c) => c.template.player.position === p);
    const starters = [
      ...by("GK").slice(0, 1).map((c) => ({ cardId: c.id, position: "GK" as const })),
      ...by("DEF").slice(0, 2).map((c) => ({ cardId: c.id, position: "DEF" as const })),
      ...by("MID").slice(0, 2).map((c) => ({ cardId: c.id, position: "MID" as const })),
      ...by("ATT").slice(0, 2).map((c) => ({ cardId: c.id, position: "ATT" as const })),
    ];
    const used = new Set(starters.map((x) => x.cardId));
    const squad = { formation: "2-2-2", starters, bench: cards.filter((c) => !used.has(c.id)).map((c) => c.id).slice(0, 1) };
    const realOpen = await db.competition.findFirstOrThrow({ where: { gameweekId: real.id, code: { endsWith: "-open" } } });
    await submitEntry(a.userId, realOpen.id, squad);

    const ko = new Date(now.getTime() + 4 * MIN);
    const sim = await createSimMatchday(admin.userId, { kickoffAt: ko, match: { name: "Sim Night", prizes: "1=5", freeCardsOnly: true } }, now);
    expect(sim.copied).toBe(1);
    const comp = await db.competition.findFirstOrThrow({ where: { gameweekId: sim.gameweekId } });
    expect(comp.name).toBe("Sim Night · SIM 1");
    expect(comp.locksAt.getTime()).toBe(ko.getTime() - MIN);
    // A second sim game at the same matchday, limited to one league.
    const { createMatch } = await import("@/server/competitions");
    const t1 = await createMatch(admin.userId, { gameweekId: sim.gameweekId, name: "T1 only", leagues: ["T1"] });
    expect((t1.requirements as { leagues?: string[] }).leagues).toEqual(["T1"]);
    // Both leagues ticked = no restriction.
    const both = await createMatch(admin.userId, { gameweekId: sim.gameweekId, name: "All in", leagues: ["T1", "T2"] });
    expect((both.requirements as { leagues?: string[] }).leagues).toBeUndefined();
    // Same cards, still locked in the real squad: fine for a sim.
    await submitEntry(a.userId, comp.id, squad);
    const card = await db.cardInstance.findUniqueOrThrow({ where: { id: starters[0].cardId } });
    expect(card.lockRef).not.toBeNull(); // still the real entry's lock

    const at = (sec: number) => new Date(ko.getTime() + sec * 1000);
    await playSimMatchdays(at(100));
    const mid = await db.fixture.findMany({ where: { gameweekId: sim.gameweekId } });
    expect(mid.every((f) => f.status === "LIVE")).toBe(true);
    const end = simPlan(sim.gameweekId, null).end;
    await playSimMatchdays(at(end + 1));
    const ft = await db.fixture.findMany({ where: { gameweekId: sim.gameweekId } });
    expect(ft.every((f) => f.status === "FINISHED")).toBe(true);
    // The feed matches the score: one goal event per goal.
    for (const f of ft) {
      const ev = (f.simEvents ?? []) as Array<{ type: string; side: string; minute: number; player: string }>;
      const goals = (side: string) => ev.filter((e) => (e.type === "goal" || e.type === "own_goal") && e.side === side).length;
      expect(goals("home")).toBe(f.homeGoals);
      expect(goals("away")).toBe(f.awayGoals);
      expect(ev.every((e) => e.player && e.minute >= 1 && e.minute <= 90)).toBe(true);
    }
    await playSimMatchdays(at(end + 8));
    expect((await db.competition.findUniqueOrThrow({ where: { id: comp.id } })).status).toBe("SETTLED");
    const entry = await db.competitionEntry.findFirstOrThrow({ where: { competitionId: comp.id } });
    expect(entry.rank).toBe(1);
    expect(await db.walletEntry.count({ where: { userId: a.userId, kind: "PRIZE" } })).toBe(1);
    // Watch again: the replay rebuilds the same results minute by minute.
    const { simReplay } = await import("@/server/sim-replay");
    const replay = (await simReplay(sim.gameweekId))!;
    const fts = await db.fixture.findMany({ where: { gameweekId: sim.gameweekId }, orderBy: [{ kickoffAt: "asc" }, { providerFixtureId: "asc" }] });
    const lastFrame = replay.frames[replay.frames.length - 1];
    expect(lastFrame.clock).toBe("FT");
    fts.forEach((f, i) => expect([lastFrame.s[2 * i], lastFrame.s[2 * i + 1]]).toEqual([f.homeGoals, f.awayGoals]));
    expect(lastFrame.e[entry.id]).toBe(entry.finalPoints);
    expect(replay.frames.some((f) => f.clock === "HT")).toBe(true);
    // The real squad is untouched and its cards are still locked to it.
    expect((await db.cardInstance.findUniqueOrThrow({ where: { id: starters[0].cardId } })).lock).toBe("COMPETITION");
  });
});

describe("likely to start (sim)", () => {
  it("first-choice shirt numbers are far more likely to start than squad players, and a lone keeper always starts", async () => {
    const { simStartGuide } = await import("@/server/sim-lineups");
    const club = await db.club.findFirstOrThrow({ orderBy: { code: "asc" } });
    const squad = await db.player.findMany({ where: { clubId: club.id }, orderBy: { lastName: "asc" } });
    const defs = squad.filter((p) => p.position === "DEF");
    // Number the defenders 1–4 (first choice) and the rest 30+ (fringe).
    for (const [i, p] of defs.entries()) await db.player.update({ where: { id: p.id }, data: { squadNumber: i < 4 ? i + 2 : 30 + i } });
    const g = await simStartGuide(squad.map((p) => p.id));
    for (const p of squad) expect(g.get(p.id)!.pct).toBeGreaterThanOrEqual(0);
    const gks = squad.filter((p) => p.position === "GK");
    if (gks.length === 1) expect(g.get(gks[0].id)!.pct).toBe(100);
    if (defs.length > 4) {
      const first = defs.slice(0, 4).map((p) => g.get(p.id)!.pct);
      const fringe = defs.slice(4).map((p) => g.get(p.id)!.pct);
      expect(Math.min(...first)).toBeGreaterThan(Math.max(...fringe));
    }
  });
});

describe("start chance from real appearances × form", () => {
  it("players who played every real game are nailed on (100%); ones who never played don't start", async () => {
    const { simStartGuide, startScores } = await import("@/server/sim-lineups");
    const sport = await db.sport.findFirstOrThrow();
    const [club, opp] = await db.club.findMany({ orderBy: { code: "asc" }, take: 2 });
    const squad = await db.player.findMany({ where: { clubId: club.id }, orderBy: { lastName: "asc" } });
    const defs = squad.filter((p) => p.position === "DEF");
    const gk = squad.filter((p) => p.position === "GK");
    const gw = await db.gameweek.create({ data: { sportId: sport.id, season: "real-hist", number: 1, startsAt: new Date(Date.now() - 40 * 86_400_000), endsAt: new Date(Date.now() - 30 * 86_400_000), status: "SETTLED" } });
    for (let i = 0; i < 6; i++) {
      const f = await db.fixture.create({ data: { gameweekId: gw.id, provider: "test", providerFixtureId: `hist-${i}`, homeClubId: club.id, awayClubId: opp.id, kickoffAt: new Date(Date.now() - (30 + i) * 86_400_000), status: "FINISHED", homeGoals: 1, awayGoals: 0 } });
      // The first four defenders and the first keeper play every minute; the rest never play.
      for (const p of [...defs.slice(0, 4), gk[0]]) {
        await db.playerMatchStat.create({ data: { fixtureId: f.id, playerId: p.id, revision: 1, isCurrent: true, sourceEventId: `ev-${i}-${p.id}`, stats: { minutes: 90, goals: 0, assists: 0, clean_sheet: true } } });
      }
    }
    const sc = await startScores(defs.map((d) => d.id), new Date());
    expect(sc.get(defs[0].id)).toMatchObject({ apps: 6, games: 6 });
    expect(sc.get(defs[4].id)).toMatchObject({ apps: 0, score: 0 });
    const g = await simStartGuide([...defs, gk[0]].map((p) => p.id));
    for (const d of defs.slice(0, 4)) expect(g.get(d.id)!.pct).toBe(100);
    expect(g.get(defs[4].id)!.pct).toBe(0);
    expect(g.get(gk[0].id)!.pct).toBe(100);
  });
});
