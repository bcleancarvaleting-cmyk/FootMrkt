import { beforeEach, describe, expect, it } from "vitest";
import { createMatch } from "@/server/competitions";
import { db } from "@/server/db";
import { createGameweek } from "@/server/gameweeks";
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
});
