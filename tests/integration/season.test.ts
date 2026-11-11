import { beforeEach, describe, expect, it } from "vitest";
import { gameHealth } from "@/server/analytics";
import { db } from "@/server/db";
import { createGameweek } from "@/server/gameweeks";
import { currentSeason, moveClub, movePlayer, nextGameweekNumber, startSeason } from "@/server/season";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("season rollover", () => {
  it("won't start while gameweeks are open; then archives the table and restarts numbering", async () => {
    const admin = await makeUser("boss");
    const gw = await createGameweek({ season: "2026-27", number: 1, opensAt: new Date(), firstKickoffAt: new Date(Date.now() + 3600_000), actorId: null });
    const a = await makeUser("champ");
    const comp = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id } });
    await db.competitionEntry.create({ data: { competitionId: comp.id, userId: a.userId, formation: "2-2-2", finalPoints: 55, rank: 1 } });

    expect(await currentSeason()).toBe("2026-27");
    await expect(startSeason(admin.userId, "2027-28")).rejects.toThrow(/aren't settled/);
    await db.competition.update({ where: { id: comp.id }, data: { status: "SETTLED" } });
    await db.gameweek.update({ where: { id: gw.id }, data: { status: "SETTLED" } });
    await expect(startSeason(admin.userId, "2025-26")).rejects.toThrow(/must come after/);

    const r = await startSeason(admin.userId, "2027-28");
    expect(r.champion).toBe("champ");
    expect(await currentSeason()).toBe("2027-28");
    expect(await nextGameweekNumber("2027-28")).toBe(1);
    const archive = await db.seasonArchive.findUniqueOrThrow({ where: { season: "2026-27" } });
    expect((archive.standings as Array<{ points: number }>)[0].points).toBe(55);
  });

  it("moves clubs between leagues and players between clubs, cards and all", async () => {
    const admin = await makeUser("boss");
    const club = await db.club.findFirstOrThrow({ where: { league: { code: "T1" } } });
    await moveClub(admin.userId, club.code, "T2");
    expect((await db.club.findUniqueOrThrow({ where: { id: club.id }, include: { league: true } })).league.code).toBe("T2");

    const player = await db.player.findFirstOrThrow({ where: { clubId: club.id } });
    const other = await db.club.findFirstOrThrow({ where: { id: { not: club.id } } });
    await movePlayer(admin.userId, player.id, other.code);
    const cards = await db.cardInstance.findMany({ where: { template: { playerId: player.id } }, include: { template: { include: { player: true } } } });
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.template.player.clubId === other.id)).toBe(true);
    await movePlayer(admin.userId, player.id, null);
    expect((await db.player.findUniqueOrThrow({ where: { id: player.id } })).active).toBe(false);
  });
});

describe("dashboard game health", () => {
  it("adds up without errors on a fresh world", async () => {
    await makeUser();
    const h = await gameHealth();
    expect(h).toMatchObject({ packs: expect.any(Number), trades: 0, rainbows: 0, attention: { support: 0, flags: 0, pulls: 0 } });
  });
});
