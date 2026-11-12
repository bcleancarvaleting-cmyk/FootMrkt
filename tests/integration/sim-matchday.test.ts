import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createSimMatchday, playSimMatchdays, simMinute, ukLocalToDate } from "@/server/sim-matchday";
import { performanceTable } from "@/server/top-performers";
import { pickTeamOfTheWeek } from "@/server/totw";
import { buildWorld, resetDb } from "./fixtures";

const MIN = 60_000;

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("simulated matchdays", () => {
  it("maps real time to a match clock with half time", () => {
    const ko = new Date("2026-11-14T19:00:00Z");
    const at = (m: number) => simMinute(ko, new Date(ko.getTime() + m * MIN));
    expect(at(-1)).toBeNull();
    expect(at(0.5)).toBe(1);
    expect(at(30)).toBe(30);
    expect(at(50)).toBe(45); // half time
    expect(at(75)).toBe(60);
    expect(at(104)).toBe(89);
    expect(at(106)).toBe(90);
  });

  it("reads admin times as UK time, GMT or BST", () => {
    expect(ukLocalToDate("2026-12-01T19:00").toISOString()).toBe("2026-12-01T19:00:00.000Z");
    expect(ukLocalToDate("2026-07-01T19:00").toISOString()).toBe("2026-07-01T18:00:00.000Z");
  });

  it("creates a SIM matchday where every club plays once, and copies the last sim day's matches", async () => {
    const now = new Date();
    const ko = new Date(now.getTime() + 60 * MIN);
    await expect(createSimMatchday(null, { kickoffAt: new Date(now.getTime() + 5 * MIN) }, now)).rejects.toThrow();
    const first = await createSimMatchday(null, { kickoffAt: ko }, now);
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
    const { gameweekId } = await createSimMatchday(null, { kickoffAt: ko }, now);
    const at = (m: number) => new Date(ko.getTime() + m * MIN);
    const goals = async () => (await db.fixture.findMany({ where: { gameweekId }, orderBy: { providerFixtureId: "asc" } })).map((f) => [f.status, (f.homeGoals ?? 0) + (f.awayGoals ?? 0)] as const);

    expect((await playSimMatchdays(at(-1))).played).toBe(0); // not kicked off
    await playSimMatchdays(at(20));
    const mid = await goals();
    expect(mid.every(([s]) => s === "LIVE")).toBe(true);
    expect((await db.gameweek.findUniqueOrThrow({ where: { id: gameweekId } })).status).toBe("PROVISIONAL");

    await playSimMatchdays(at(106));
    const ft = await goals();
    expect(ft.every(([s]) => s === "FINISHED")).toBe(true);
    ft.forEach(([, g], i) => expect(g).toBeGreaterThanOrEqual(mid[i][1])); // goals only ever go up
    expect((await db.gameweek.findUniqueOrThrow({ where: { id: gameweekId } })).status).toBe("PROVISIONAL");

    await playSimMatchdays(at(111));
    expect((await db.gameweek.findUniqueOrThrow({ where: { id: gameweekId } })).status).toBe("SETTLED");

    // Simulated results stay out of real-world stats.
    expect(await performanceTable({ window: "last" })).toHaveLength(0);
    expect((await pickTeamOfTheWeek(at(112))).picked).toHaveLength(0);
  });
});
