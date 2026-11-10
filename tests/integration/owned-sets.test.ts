import { beforeEach, describe, expect, it } from "vitest";
import { toggleShowcase } from "@/server/club-profile";
import { db } from "@/server/db";
import { allOwnedSets, claimOwnedSet, ownedSetProgress } from "@/server/owned-sets";
import { balancesFor } from "@/server/wallet";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

/** Give a manager one held card of each of these players (straight from the pool). */
async function giveCards(userId: string, playerIds: string[]) {
  const ids: string[] = [];
  for (const playerId of playerIds) {
    const card = await db.cardInstance.findFirstOrThrow({ where: { supplyState: "AVAILABLE", template: { playerId } } });
    await db.cardInstance.update({ where: { id: card.id }, data: { ownerId: userId, supplyState: "HELD" } });
    ids.push(card.id);
  }
  return ids;
}

describe("collect & keep sets", () => {
  it("claims a full squad once, keeps the cards and pays earned MX", async () => {
    const { userId } = await makeUser();
    const squad = (await allOwnedSets()).find((s) => s.kind === "squad")!;
    await expect(claimOwnedSet(userId, squad.code)).rejects.toThrow(/still need/);
    const cards = await giveCards(userId, squad.playerIds);
    const before = (await balancesFor(userId)).total;
    await claimOwnedSet(userId, squad.code);
    expect((await balancesFor(userId)).total - before).toBe(squad.rewardMinor);
    expect(await db.cardInstance.count({ where: { id: { in: cards }, ownerId: userId } })).toBe(cards.length);
    await expect(claimOwnedSet(userId, squad.code)).rejects.toThrow(/already claimed/);
    const progress = await ownedSetProgress(userId);
    expect(progress.find((p) => p.code === squad.code)).toMatchObject({ complete: true, claimed: true });
  });

  it("loan cards don't count", async () => {
    const { userId } = await makeUser();
    const squad = (await allOwnedSets()).find((s) => s.kind === "squad")!;
    const cards = await giveCards(userId, squad.playerIds);
    await db.cardInstance.update({ where: { id: cards[0] }, data: { loanGameweeks: 4 } });
    await expect(claimOwnedSet(userId, squad.code)).rejects.toThrow(/still need 1 more player/);
  });
});

describe("club page showcase", () => {
  it("pins up to 3 of your own cards", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const players = (await db.player.findMany({ take: 5, select: { id: true } })).map((p) => p.id);
    const mine = await giveCards(a.userId, players.slice(0, 4));
    const theirs = await giveCards(b.userId, players.slice(4, 5));
    for (const id of mine.slice(0, 3)) expect(await toggleShowcase(a.userId, id)).toBe(true);
    await expect(toggleShowcase(a.userId, mine[3])).rejects.toThrow(/holds 3 cards/);
    await expect(toggleShowcase(a.userId, theirs[0])).rejects.toThrow(/own cards/);
    expect(await toggleShowcase(a.userId, mine[0])).toBe(false);
    expect((await db.user.findUniqueOrThrow({ where: { id: a.userId } })).showcaseCardIds).toEqual(mine.slice(1, 3));
  });
});
