import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeAutoMatches, autoMatchesStillOpen } from "@/server/competitions";
import { db } from "@/server/db";
import { createGameweek, runScheduledJobs } from "@/server/gameweeks";
import { ensureGameweeksAhead } from "@/server/live-data";
import { buildWorld, makeUser, resetDb } from "./fixtures";

const AUTO = process.env.AUTO_MATCHES;
beforeEach(async () => {
  await resetDb();
  await buildWorld();
});
afterEach(() => {
  process.env.AUTO_MATCHES = AUTO;
});

describe("admin-made matches and gameweeks ahead", () => {
  it("loads 4 weeks of gameweeks with no matches; they stay open for matches to be added until the deadline", async () => {
    process.env.AUTO_MATCHES = "false";
    const now = new Date();
    const r = await ensureGameweeksAhead(4, now);
    expect(r.created).toBe(4);
    expect((await ensureGameweeksAhead(4, now)).created).toBe(0); // already loaded
    const gws = await db.gameweek.findMany({ include: { _count: { select: { competitions: true, fixtures: true } } }, orderBy: { number: "asc" } });
    expect(gws).toHaveLength(4);
    expect(gws.every((g) => g._count.competitions === 0 && g._count.fixtures > 0 && g.status === "OPEN")).toBe(true);
    // The scheduled job doesn't lock an empty gameweek before its deadline.
    await runScheduledJobs();
    expect((await db.gameweek.findMany({ where: { status: "OPEN" } })).length).toBe(4);
  });

  it("removes the old automatic matches that haven't locked, refunding entrants", async () => {
    process.env.AUTO_MATCHES = "true";
    const now = new Date();
    await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 48 * 3600_000), actorId: null });
    const admin = await makeUser("autoclean");
    const before = (await autoMatchesStillOpen()).length;
    expect(before).toBeGreaterThan(0);
    expect(await removeAutoMatches(admin.userId)).toBe(before);
    expect(await autoMatchesStillOpen()).toHaveLength(0);
  });
});
