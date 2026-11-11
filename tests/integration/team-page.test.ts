import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { teamPage, teamsIndex } from "@/server/team-page";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("public club pages", () => {
  it("shows a club's cards, its fans and what's been collected", async () => {
    const club = await db.club.findFirstOrThrow({ where: { players: { some: { templates: { some: { edition: "STANDARD", active: true } } } } } });
    const fan = await makeUser("clubfan");
    await db.user.update({ where: { id: fan.userId }, data: { favouriteClubId: club.id } });
    const t = await teamPage(club.code);
    expect(t?.club.code).toBe(club.code);
    expect(t!.cards.length).toBeGreaterThan(0);
    expect(t!.cards.every((c) => c.clubCode === club.code)).toBe(true);
    expect(t!.supporters).toBe(1);
    expect(await teamPage("NOPE")).toBeNull();
    const idx = await teamsIndex();
    expect(idx.flatMap((l) => l.clubs).some((c) => c.code === club.code)).toBe(true);
  });
});
