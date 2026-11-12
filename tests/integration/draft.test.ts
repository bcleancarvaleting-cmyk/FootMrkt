import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { submitEntry } from "@/server/competitions";
import { draftPool, submitDraftEntry } from "@/server/draft";
import { createGameweek, simulateFixturesNow } from "@/server/gameweeks";
import { settleCompetition } from "@/server/scoring";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

async function draftMatch(budget: number, maxPerClub = 11, number = 1) {
  const now = new Date();
  const gw = await createGameweek({ season: "T", number, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000), actorId: null });
  const open = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id, code: { endsWith: "-open" } } });
  const comp = await db.competition.create({
    data: {
      sportId: open.sportId,
      gameweekId: gw.id,
      code: open.code.replace("-open", "-drafttest"),
      name: "Draft test",
      format: open.format,
      rosterRules: open.rosterRules,
      scoringRules: open.scoringRules,
      entryOpensAt: open.entryOpensAt,
      locksAt: open.locksAt,
      status: open.status,
      requirements: { draftBudgetMx: budget, leagues: ["T1"], maxPerClub },
      rewards: [],
    },
  });
  return { gw, comp };
}

/** A legal 2-2-2 squad from the draft pool: cheapest players first. */
async function cheapSquad() {
  const pool = (await draftPool(["T1"])).sort((a, b) => (a.valueMp ?? 0) - (b.valueMp ?? 0));
  const by = (p: string) => pool.filter((x) => x.position === p);
  const starters = [
    ...by("GK").slice(0, 1).map((x) => ({ playerId: x.playerId, position: "GK" as const })),
    ...by("DEF").slice(0, 2).map((x) => ({ playerId: x.playerId, position: "DEF" as const })),
    ...by("MID").slice(0, 2).map((x) => ({ playerId: x.playerId, position: "MID" as const })),
    ...by("ATT").slice(0, 2).map((x) => ({ playerId: x.playerId, position: "ATT" as const })),
  ];
  const used = new Set(starters.map((s) => s.playerId));
  const bench = pool.filter((x) => x.position !== "GK" && !used.has(x.playerId)).slice(0, 1).map((x) => x.playerId);
  return { formation: "2-2-2", starters, bench, captain: starters[6].playerId };
}

describe("free draft", () => {
  it("anyone can enter without cards, within the budget and club limit", async () => {
    const { comp } = await draftMatch(1000);
    const { userId } = await makeUser();
    const squad = await cheapSquad();
    await submitDraftEntry(userId, comp.id, squad);
    const sels = await db.competitionSelection.findMany({ where: { entry: { userId } } });
    expect(sels).toHaveLength(8);
    expect(sels.every((s) => s.cardId === null)).toBe(true);
    // A draft match can't be entered with cards, and the budget is enforced.
    await expect(submitEntry(userId, comp.id, { formation: "2-2-2", starters: [], bench: [] })).rejects.toMatchObject({ code: "DRAFT_MATCH" });
    const tight = await draftMatch(10, 11, 2);
    await expect(submitDraftEntry(userId, tight.comp.id, squad)).rejects.toThrow(/budget/);
  });

  it("enforces the per-club limit", async () => {
    const { comp } = await draftMatch(1000, 2);
    const { userId } = await makeUser();
    await expect(submitDraftEntry(userId, comp.id, await cheapSquad())).rejects.toThrow(/players from one club/);
  });

  it("scores and settles like any match, but draft picks never add to a card's points history", async () => {
    const { gw, comp } = await draftMatch(1000);
    const { userId } = await makeUser();
    await submitDraftEntry(userId, comp.id, await cheapSquad());
    await simulateFixturesNow(gw.id, "all", null);
    await settleCompetition(comp.id);
    const entry = await db.competitionEntry.findFirstOrThrow({ where: { competitionId: comp.id } });
    expect(entry.rank).toBe(1);
    expect(entry.finalPoints).not.toBeNull();
    expect(await db.cardPoints.count({ where: { entryId: entry.id } })).toBe(0);
  });
});
