import { beforeEach, describe, expect, it } from "vitest";
import { registerUser } from "@/server/auth/accounts";
import { clubProfile } from "@/server/club-profile";
import { db } from "@/server/db";
import { createGameweek } from "@/server/gameweeks";
import { openPack } from "@/server/packs";
import { buildWorld, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("public club page", () => {
  it("shows crest, level, trophies and cards — and nothing personal", async () => {
    const r = await registerUser({ email: "secret@test.dev", password: "correct-horse-battery", displayName: "Showoff", clubName: "Peckham Rovers" });
    await openPack(r.user.id, r.starterEntitlementId);
    const now = new Date();
    const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000), actorId: null });
    const comp = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id } });
    await db.competitionEntry.create({ data: { competitionId: comp.id, userId: r.user.id, formation: "2-2-2", finalPoints: 42, rank: 1 } });
    await db.competition.update({ where: { id: comp.id }, data: { status: "SETTLED", settledAt: new Date() } });

    const p = await clubProfile("showoff");
    expect(p).not.toBeNull();
    expect(p!.manager).toMatchObject({ name: "Showoff", clubName: "Peckham Rovers", cards: 12 });
    expect(p!.manager.crest).not.toBeNull();
    expect(p!.trophies.wins).toEqual([expect.objectContaining({ name: comp.name, gameweek: 1, points: 42 })]);
    expect(JSON.stringify(p)).not.toContain("secret@test.dev");
    expect(await clubProfile("nobody-here")).toBeNull();
  });
});
