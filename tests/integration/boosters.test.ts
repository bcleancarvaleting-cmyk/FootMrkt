import { beforeEach, describe, expect, it } from "vitest";
import { BOOSTERS } from "@/config/boosters";
import { attachBooster, grantWeeklyBoosters, latestDrop, myBoosters, openBoosterPack, remindExpiringBoosters } from "@/server/boosters";
import { submitEntry, withdrawEntry } from "@/server/competitions";
import { db, withTx } from "@/server/db";
import { createGameweek } from "@/server/gameweeks";
import { openPack } from "@/server/packs";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

describe("booster drop time", () => {
  it("is Tuesday 9am UK time, in winter (GMT) and summer (BST)", () => {
    // Winter: Tue 17 Nov 2026, 9am GMT = 09:00Z.
    expect(latestDrop(new Date("2026-11-17T09:00:00Z"))).toEqual({ key: "2026-11-17", at: new Date("2026-11-17T09:00:00Z") });
    expect(latestDrop(new Date("2026-11-17T08:59:00Z")).key).toBe("2026-11-10");
    expect(latestDrop(new Date("2026-11-22T12:00:00Z")).key).toBe("2026-11-17");
    // Summer: Tue 11 Aug 2026, 9am BST = 08:00Z.
    expect(latestDrop(new Date("2026-08-11T08:00:00Z"))).toEqual({ key: "2026-08-11", at: new Date("2026-08-11T08:00:00Z") });
    expect(latestDrop(new Date("2026-08-11T07:59:00Z")).key).toBe("2026-08-04");
  });
});

async function enteredSquad(userId: string, entitlementId: string) {
  const res = await openPack(userId, entitlementId);
  const cards = await db.cardInstance.findMany({ where: { id: { in: res.cards.map((c) => c.cardId) } }, include: { template: { include: { player: true } } } });
  const by = (p: string) => cards.filter((c) => c.template.player.position === p);
  const starters = [
    ...by("GK").slice(0, 1).map((c) => ({ cardId: c.id, position: "GK" as const })),
    ...by("DEF").slice(0, 2).map((c) => ({ cardId: c.id, position: "DEF" as const })),
    ...by("MID").slice(0, 2).map((c) => ({ cardId: c.id, position: "MID" as const })),
    ...by("ATT").slice(0, 2).map((c) => ({ cardId: c.id, position: "ATT" as const })),
  ];
  const used = new Set(starters.map((s) => s.cardId));
  return { formation: "2-2-2", starters, bench: cards.filter((c) => !used.has(c.id)).map((c) => c.id).slice(0, 4) };
}

describe("weekly booster packs", () => {
  it("land once a week for active managers, open to a booster, and play on one player in one match entry, paid or free", async () => {
    const now = new Date();
    const gw = await createGameweek({ season: "T", number: 1, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3 * 86_400_000), actorId: null });
    const a = await makeUser();
    await db.user.update({ where: { id: a.userId }, data: { lastSeenAt: now } });
    expect(await grantWeeklyBoosters(now)).toBe(1);
    expect(await grantWeeklyBoosters(now)).toBe(0);
    expect(await db.notification.count({ where: { userId: a.userId, kind: "BOOSTER" } })).toBe(1);

    const [pack] = await myBoosters(a.userId);
    expect(pack).toMatchObject({ kind: null, opened: false });
    const kind = await openBoosterPack(a.userId, pack.id);
    expect(Object.keys(BOOSTERS)).toContain(kind);
    expect(await openBoosterPack(a.userId, pack.id)).toBe(kind); // opening again shows the same booster

    const squad = await enteredSquad(a.userId, a.starterEntitlementId);
    const open = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id, code: { endsWith: "-open" } } });
    const freeroll = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id, code: { endsWith: "-freeroll" } } });
    // The manager picks who carries it: a sub for Super Sub, a starter for the rest.
    const benchOnly = BOOSTERS[kind as keyof typeof BOOSTERS].benchOnly;
    const right = benchOnly ? squad.bench[0] : squad.starters[0].cardId;
    const wrong = benchOnly ? squad.starters[0].cardId : squad.bench[0];
    await expect(submitEntry(a.userId, open.id, { ...squad, boosterId: pack.id })).rejects.toThrow(/Pick the player/);
    await expect(submitEntry(a.userId, open.id, { ...squad, boosterId: pack.id, boostedOn: wrong })).rejects.toThrow(/goes on one of your/);
    const entry = await submitEntry(a.userId, open.id, { ...squad, boosterId: pack.id, boostedOn: right });
    expect((await db.competitionEntry.findUniqueOrThrow({ where: { id: entry.id } })).boosterKind).toBe(kind);
    const boosted = await db.competitionSelection.findMany({ where: { entryId: entry.id, isBoosted: true } });
    expect(boosted.map((x) => x.cardId)).toEqual([right]);
    // Re-saving without a booster takes it off the player.
    await submitEntry(a.userId, open.id, { ...squad, boosterId: null });
    expect(await db.competitionSelection.count({ where: { entryId: entry.id, isBoosted: true } })).toBe(0);
    await submitEntry(a.userId, open.id, { ...squad, boosterId: pack.id, boostedOn: right });
    expect((await myBoosters(a.userId))[0].usedEntryId).toBe(entry.id);
    // Strictly once: it can't go on a second match while it's on this one.
    const other = await db.competitionEntry.create({ data: { competitionId: freeroll.id, userId: a.userId, formation: squad.formation } });
    await expect(withTx((tx) => attachBooster(tx, a.userId, other.id, pack.id, right))).rejects.toThrow(/already on another/);
    await db.competitionEntry.delete({ where: { id: other.id } });
    // Withdrawing gives it back...
    await withdrawEntry(a.userId, open.id);
    expect((await myBoosters(a.userId))[0].usedEntryId).toBeNull();
    // ...and it can go on any match, cash-prize ones included.
    const cash = await submitEntry(a.userId, freeroll.id, { ...squad, boosterId: pack.id, boostedOn: right });
    expect((await db.competitionEntry.findUniqueOrThrow({ where: { id: cash.id } })).boosterKind).toBe(kind);
  });

  it("can't be played once expired, and owners get one reminder the day before", async () => {
    const a = await makeUser();
    const now = new Date();
    const pack = await db.boosterPack.create({ data: { userId: a.userId, weekKey: "w1", kind: "GOAL_RUSH", openedAt: now, expiresAt: new Date(now.getTime() + 12 * 3600_000) } });
    expect(await remindExpiringBoosters(now)).toBe(1);
    expect(await remindExpiringBoosters(now)).toBe(0);
    await db.boosterPack.update({ where: { id: pack.id }, data: { expiresAt: new Date(now.getTime() - 1000) } });
    expect(await myBoosters(a.userId)).toHaveLength(0);
    await expect(openBoosterPack(a.userId, pack.id)).resolves.toBe("GOAL_RUSH");
  });
});
