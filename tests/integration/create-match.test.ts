import { beforeEach, describe, expect, it } from "vitest";
import { createMatch } from "@/server/competitions";
import { db } from "@/server/db";
import { createGameweek, ensureStandardMatches } from "@/server/gameweeks";
import { draftPool } from "@/server/draft";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("admin: create a match", () => {
  it("adds a league-only match to an open gameweek with the same deadline, pack prizes and the £-prize safeguard", async () => {
    const now = Date.now();
    const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now - 1000), firstKickoffAt: new Date(now + 48 * 3600_000), actorId: null });
    const admin = await makeUser("boss");
    const other = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id } });

    const c = await createMatch(admin.userId, { gameweekId: gw.id, name: "T2 Cup", league: "T2", tier: "BRONZE", maxPerClub: 2, winnerPack: "GOLD", top3Pack: "SILVER" });
    expect(c).toMatchObject({ name: "T2 Cup · GW1", format: "BRONZE_ONLY", status: "OPEN", locksAt: other.locksAt });
    expect(c.requirements).toEqual({ leagues: ["T2"], maxPerClub: 2 });
    expect(c.rewards).toEqual([
      { rankFrom: 1, rankTo: 1, packSkuCode: "football-eng-gold" },
      { rankFrom: 2, rankTo: 3, packSkuCode: "football-eng-silver" },
    ]);

    // £ prizes need free entry and free cards only.
    await expect(createMatch(admin.userId, { gameweekId: gw.id, name: "Cash", prizes: "1=10" })).rejects.toThrow(/Free cards only/);
    const cash = await createMatch(admin.userId, { gameweekId: gw.id, name: "Cash", prizes: "1=10", freeCardsOnly: true });
    expect(cash.rewards).toEqual([{ rankFrom: 1, rankTo: 1, cashMinor: 1000 }]);

    // Free draft gets a budget; unknown leagues are refused.
    const draft = await createMatch(admin.userId, { gameweekId: gw.id, name: "Draft T1", kind: "DRAFT", league: "T1" });
    expect(draft.requirements).toEqual({ leagues: ["T1"], draftBudgetMx: 70 });
    await expect(createMatch(admin.userId, { gameweekId: gw.id, name: "Nope", league: "XYZ" })).rejects.toThrow(/Unknown league/);
  });

  it("head to head: pick a real fixture and only those two clubs' players count", async () => {
    const now = Date.now();
    const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now - 1000), firstKickoffAt: new Date(now + 48 * 3600_000), actorId: null });
    const admin = await makeUser("boss2");
    const fx = await db.fixture.findFirstOrThrow({ where: { gameweekId: gw.id }, include: { homeClub: true, awayClub: true } });
    const h2h = await createMatch(admin.userId, { gameweekId: gw.id, fixtureId: fx.id, kind: "DRAFT", maxPerClub: 3 });
    expect(h2h.name).toBe(`${fx.homeClub.shortName} v ${fx.awayClub.shortName} · GW1`);
    // A 3-per-club cap can't fill 11 places from two clubs, so it's dropped.
    expect(h2h.requirements).toEqual({ clubs: [fx.homeClub.code, fx.awayClub.code], draftBudgetMx: 70 });
    const pool = await draftPool(undefined, [fx.homeClub.code, fx.awayClub.code]);
    expect(pool.length).toBeGreaterThan(11);
    expect(new Set(pool.map((p) => p.clubCode))).toEqual(new Set([fx.homeClub.code, fx.awayClub.code]));
  });

  it("every open gameweek gets the four league matches, once", async () => {
    const now = Date.now();
    const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now - 1000), firstKickoffAt: new Date(now + 48 * 3600_000), actorId: null });
    const names = (await db.competition.findMany({ where: { gameweekId: gw.id } })).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Premier League · GW1", "Championship · GW1", "League One · GW1", "League Two · GW1"]));
    // A gameweek made before the league matches existed gets them added by the scheduled job.
    await db.competition.deleteMany({ where: { gameweekId: gw.id, code: { endsWith: "-lg2" } } });
    expect(await ensureStandardMatches()).toBe(1);
    expect(await ensureStandardMatches()).toBe(0);
    const lg2 = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id, code: { endsWith: "-lg2" } } });
    expect(lg2.requirements).toEqual({ leagues: ["LG2"] });
  });
});
