import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { submitEntry } from "@/server/competitions";
import { autoSettleRealGameweeks, createGameweek, simulateCorrections, simulateFixturesNow } from "@/server/gameweeks";
import { ingestMessages } from "@/server/ingestion";
import { openPack } from "@/server/packs";
import { reproduceCalculation, settleCompetition } from "@/server/scoring";
import { simulatedProvider } from "@/providers/football/simulated";
import type { ProviderMessage } from "@/providers/football/types";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

async function starterSquad(userId: string, entitlementId: string) {
  const res = await openPack(userId, entitlementId);
  const cards = await db.cardInstance.findMany({
    where: { id: { in: res.cards.map((c) => c.cardId) } },
    include: { template: { include: { player: true } } },
  });
  const by = (p: string) => cards.filter((c) => c.template.player.position === p);
  const starters = [
    ...by("GK").slice(0, 1).map((c) => ({ cardId: c.id, position: "GK" as const })),
    ...by("DEF").slice(0, 2).map((c) => ({ cardId: c.id, position: "DEF" as const })),
    ...by("MID").slice(0, 2).map((c) => ({ cardId: c.id, position: "MID" as const })),
    ...by("ATT").slice(0, 2).map((c) => ({ cardId: c.id, position: "ATT" as const })),
  ];
  const used = new Set(starters.map((s) => s.cardId));
  const bench = cards.filter((c) => !used.has(c.id)).map((c) => c.id).slice(0, 1);
  return { formation: "2-2-2", starters, bench };
}

async function setupGameweek() {
  const now = new Date();
  const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000), actorId: null });
  const open = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id, code: { endsWith: "-open" } } });
  // Deadline is exactly 10 minutes before the earliest kick-off.
  const first = await db.fixture.findFirstOrThrow({ where: { gameweekId: gw.id }, orderBy: { kickoffAt: "asc" } });
  if (open.locksAt.getTime() !== first.kickoffAt.getTime() - 10 * 60_000) throw new Error("deadline is not kick-off minus 10 minutes");
  const bronze = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id, code: { endsWith: "-bronze" } } });
  return { gw, open, bronze };
}

describe("football competition end to end (spec §6, §17)", () => {
  it("validates and locks squads, scores provisionally, applies corrections, settles and reproduces", async () => {
    const { gw, open, bronze } = await setupGameweek();
    const a = await makeUser("alice");
    const b = await makeUser("bob");
    const squadA = await starterSquad(a.userId, a.starterEntitlementId);
    const squadB = await starterSquad(b.userId, b.starterEntitlementId);

    // Invalid: wrong bench size.
    await expect(submitEntry(a.userId, open.id, { ...squadA, bench: [] })).rejects.toMatchObject({ code: "SQUAD_INVALID" });
    // Invalid: someone else's cards.
    await expect(submitEntry(a.userId, open.id, squadB)).rejects.toMatchObject({ code: "SQUAD_INVALID" });

    const entryA = await submitEntry(a.userId, open.id, squadA);
    await submitEntry(b.userId, open.id, squadB);
    const locked = await db.cardInstance.count({ where: { lock: "COMPETITION", lockRef: entryA.id } });
    expect(locked).toBe(8);

    // Same cards can't go into a second competition at the same time.
    await expect(submitEntry(a.userId, bronze.id, squadA)).rejects.toMatchObject({ code: "SQUAD_INVALID" });
    // Re-submitting to the same competition (e.g. bench reorder) is fine.
    await submitEntry(a.userId, open.id, { ...squadA, bench: [...squadA.bench].reverse() });

    // Kick off half the fixtures: provisional scores appear, competition locks.
    await simulateFixturesNow(gw.id, 1, null);
    expect((await db.competition.findUniqueOrThrow({ where: { id: open.id } })).status).toBe("PROVISIONAL");
    await expect(submitEntry(a.userId, open.id, squadA)).rejects.toMatchObject({ code: "LOCKED" });
    // Settlement is refused while fixtures are pending.
    await expect(settleCompetition(open.id)).rejects.toMatchObject({ code: "FIXTURES_PENDING" });

    await simulateFixturesNow(gw.id, "all", null);
    const provisional = await db.competitionEntry.findUniqueOrThrow({ where: { id: entryA.id } });
    expect(provisional.provisionalPoints).not.toBeNull();

    // A provider correction creates a new revision — never an extra line.
    const before = await db.playerMatchStat.count({ where: { isCurrent: true } });
    const corr = await simulateCorrections(gw.id, 2);
    expect(corr.applied).toBeGreaterThan(0);
    expect(await db.playerMatchStat.count({ where: { isCurrent: true } })).toBe(before);
    expect(await db.playerMatchStat.count({ where: { isCurrent: false } })).toBe(corr.applied);

    // Settles itself 90 minutes after the last full time — not before (corrections can still land).
    const lastFt = (await db.fixture.findFirstOrThrow({ where: { gameweekId: gw.id }, orderBy: { finalisedAt: "desc" } })).finalisedAt!;
    expect((await autoSettleRealGameweeks(new Date(lastFt.getTime() + 89 * 60_000))).settled).toEqual([]);
    expect((await db.competition.findUniqueOrThrow({ where: { id: open.id } })).status).not.toBe("SETTLED");
    expect((await autoSettleRealGameweeks(new Date(lastFt.getTime() + 91 * 60_000))).settled).toEqual([gw.number]);
    const settled = await db.competition.findUniqueOrThrow({ where: { id: open.id } });
    expect(settled.status).toBe("SETTLED");
    const entries = await db.competitionEntry.findMany({ where: { competitionId: open.id }, orderBy: { rank: "asc" } });
    expect(entries.map((e) => e.rank)).toEqual(entries[0].finalPoints === entries[1].finalPoints ? [1, 1] : [1, 2]);
    expect(await db.cardInstance.count({ where: { lock: "COMPETITION" } })).toBe(0);
    // "Points won for you": per card, per account, and they add up to each manager's final score.
    for (const e of entries) {
      const sum = await db.cardPoints.aggregate({ where: { entryId: e.id }, _sum: { points: true } });
      expect(sum._sum.points ?? 0).toBe(e.finalPoints);
      expect(await db.cardPoints.count({ where: { entryId: e.id, userId: { not: e.userId } } })).toBe(0);
    }
    // DEV rewards were granted, once.
    expect(await db.packEntitlement.count({ where: { source: "REWARD", sourceRef: { startsWith: "reward:" } } })).toBe(2);
    const cardPointRows = await db.cardPoints.count();
    expect((await settleCompetition(open.id)).alreadySettled).toBe(true);
    expect(await db.cardPoints.count()).toBe(cardPointRows);
    // History stamps are written once at settlement; re-running adds nothing.
    const { stampCompetition } = await import("@/server/stamps");
    const stamped = await db.cardStamp.count();
    expect(await stampCompetition(open.id)).toBe(0);
    expect(await db.cardStamp.count()).toBe(stamped);
    // Every counted card of the winner who played is stamped "Match winner".
    // (A dead heat can give more than one winner.)
    const winners = new Set((await db.competitionEntry.findMany({ where: { competitionId: open.id, rank: 1 } })).map((e) => e.userId));
    const winnerStamps = await db.cardStamp.findMany({ where: { competitionId: open.id, kind: "MATCH_WINNER" } });
    expect(winnerStamps.every((st) => winners.has(st.userId) && st.detail.includes("GW1"))).toBe(true);
    expect(await db.packEntitlement.count({ where: { source: "REWARD", sourceRef: { startsWith: "reward:" } } })).toBe(2);

    // Score reproduces from stored source events, even after a later correction arrives.
    await simulateCorrections(gw.id, 3);
    const finalCalc = await db.scoreCalculation.findFirstOrThrow({ where: { entryId: entryA.id, kind: "FINAL" } });
    const repro = await reproduceCalculation(finalCalc.id);
    expect(repro.ok).toBe(true);
    expect(repro.recomputed).toBe(entries.find((e) => e.id === entryA.id)!.finalPoints);
  });
});

describe("event ingestion idempotency (spec §6.4, §17)", () => {
  it("ignores replays and stale revisions", async () => {
    const { gw } = await setupGameweek();
    const fx = await db.fixture.findFirstOrThrow({ where: { gameweekId: gw.id } });
    const player = await db.player.findFirstOrThrow({ where: { clubId: fx.homeClubId } });
    const ref = (player.providerRefs as Record<string, string>).sim;
    const msg = (rev: number, goals: number): ProviderMessage => ({
      providerEventId: `${fx.providerFixtureId}:player:${ref}:${rev}`,
      kind: "PLAYER_STATS",
      providerFixtureId: fx.providerFixtureId,
      playerRef: ref,
      revision: rev,
      payload: { mins_played: 90, goals },
    });

    const r1 = await ingestMessages(simulatedProvider, [msg(1, 1)]);
    expect(r1.applied).toBe(1);
    const replay = await ingestMessages(simulatedProvider, [msg(1, 1)]);
    expect(replay.duplicates).toBe(1);
    const r2 = await ingestMessages(simulatedProvider, [msg(2, 2)]);
    expect(r2.applied).toBe(1);
    // An older revision arriving late is stored raw but not applied.
    const stale = await ingestMessages(simulatedProvider, [{ ...msg(1, 5), providerEventId: "late-copy" }]);
    expect(stale.stale).toBe(1);

    const lines = await db.playerMatchStat.findMany({ where: { playerId: player.id }, orderBy: { revision: "asc" } });
    expect(lines.map((l) => [l.revision, l.isCurrent])).toEqual([[1, false], [2, true]]);
    expect((lines[1].stats as { goals: number }).goals).toBe(2);
    expect(await db.providerEvent.count()).toBe(3);
  });
});
