import { beforeEach, describe, expect, it } from "vitest";
import { LOAN_PICK_CODE } from "@/config/packs";
import { createChallenge, eligibleCards } from "@/server/challenges";
import { submitEntry } from "@/server/competitions";
import { db, withTx } from "@/server/db";
import { createGameweek } from "@/server/gameweeks";
import { LOAN_GAMEWEEKS, assertLoansUsable, expireLoans, loansLeft } from "@/server/loans";
import { openPack } from "@/server/packs";
import { choosePick, pickOptions } from "@/server/picks";
import { cardViews } from "@/server/views";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

async function gameweek(number: number) {
  const now = new Date();
  const gw = await createGameweek({ season: "T", number, opensAt: new Date(now.getTime() - 1000), firstKickoffAt: new Date(now.getTime() + 3600_000 * number), actorId: null });
  const open = await db.competition.findFirstOrThrow({ where: { gameweekId: gw.id, code: { endsWith: "-open" } } });
  return { gw, open };
}

/** A 2-2-2 squad that uses the loan cards first, then starter cards. */
async function squadWithLoans(userId: string) {
  const cards = await db.cardInstance.findMany({ where: { ownerId: userId, supplyState: "HELD" }, include: { template: { include: { player: true } } }, orderBy: { loanGameweeks: { sort: "asc", nulls: "last" } } });
  const need: Record<string, number> = { GK: 1, DEF: 2, MID: 2, ATT: 2 };
  const starters: Array<{ cardId: string; position: "GK" | "DEF" | "MID" | "ATT" }> = [];
  for (const c of cards) {
    const pos = c.template.player.position;
    if (need[pos] > 0) {
      need[pos]--;
      starters.push({ cardId: c.id, position: pos });
    }
  }
  const used = new Set(starters.map((s) => s.cardId));
  return { formation: "2-2-2", starters, bench: cards.filter((c) => !used.has(c.id)).map((c) => c.id).slice(0, 4) };
}

describe("starter loan players", () => {
  it("every new manager chooses 2 of 6 top-flight Golds on loan: free, untradeable, no value, never handed in", async () => {
    const u = await makeUser("loaner");
    const ent = await db.packEntitlement.findFirstOrThrow({ where: { userId: u.userId, packSku: { code: LOAN_PICK_CODE } } });
    await expect(openPack(u.userId, ent.id)).rejects.toMatchObject({ code: "USE_PICK" });
    const opts = await pickOptions(u.userId, ent.id);
    expect(opts.playerIds).toHaveLength(6);
    expect(opts.cards.every((c) => c.category === "GOLD" && c.topFlight && c.loan && c.valueMp === null)).toBe(true);
    // Same shortlist every time.
    expect((await pickOptions(u.userId, ent.id)).playerIds).toEqual(opts.playerIds);

    await expect(choosePick(u.userId, ent.id, [opts.playerIds[0]])).rejects.toMatchObject({ code: "PICK_COUNT" });
    const r = await choosePick(u.userId, ent.id, opts.playerIds.slice(0, 2));
    await expect(choosePick(u.userId, ent.id, opts.playerIds.slice(2, 4))).rejects.toMatchObject({ code: "ALREADY_PICKED" });
    const loans = await db.cardInstance.findMany({ where: { id: { in: r.cardIds } }, include: { template: true } });
    expect(loans).toHaveLength(2);
    expect(loans.every((c) => c.loanGameweeks === LOAN_GAMEWEEKS && c.tradeStatus === "NON_TRADEABLE" && c.template.edition === "LOAN" && c.ownerId === u.userId)).toBe(true);

    const views = await cardViews({ id: { in: r.cardIds } });
    expect(views.every((v) => v.valueMp === null && v.loan?.left === LOAN_GAMEWEEKS)).toBe(true);

    // Never eligible for challenges (which take any other card, free ones included).
    const ch = await createChallenge(u.userId, { code: "any-gold", name: "Any Gold", description: "Hand in any Gold", criteria: { count: 1, tiers: ["GOLD"] }, rewardMinor: 100, maxPerUser: 1 });
    const eligible = await eligibleCards(u.userId, ch.id);
    expect(eligible.cards.some((c) => r.cardIds.includes(c.id))).toBe(false);
  });

  it("plays in the first 4 gameweeks the manager enters, then leaves the club once they've settled", async () => {
    const u = await makeUser("loaner2");
    await openPack(u.userId, u.starterEntitlementId);
    const ent = await db.packEntitlement.findFirstOrThrow({ where: { userId: u.userId, packSku: { code: LOAN_PICK_CODE } } });
    const { cardIds } = await choosePick(u.userId, ent.id, (await pickOptions(u.userId, ent.id)).playerIds.slice(0, 2));

    const gws: Awaited<ReturnType<typeof gameweek>>[] = [];
    for (let n = 1; n <= 5; n++) gws.push(await gameweek(n));

    // Gameweek 1 through the real squad flow, loans included.
    const squad = await squadWithLoans(u.userId);
    expect(squad.starters.filter((s) => cardIds.includes(s.cardId))).toHaveLength(2);
    await submitEntry(u.userId, gws[0].open.id, squad);
    const left = await loansLeft(await db.cardInstance.findMany({ where: { id: { in: cardIds } } }));
    expect([...left.values()]).toEqual([3, 3]);

    // Gameweeks 2-4 entered (with or without the loans, they count).
    for (const g of gws.slice(1, 4)) await db.competitionEntry.create({ data: { competitionId: g.open.id, userId: u.userId, formation: "2-2-2" } });
    expect([...(await loansLeft(await db.cardInstance.findMany({ where: { id: { in: cardIds } } }))).values()]).toEqual([0, 0]);
    // Still fine for a gameweek already counted, not for a 5th.
    await withTx((tx) => assertLoansUsable(tx, u.userId, gws[3].gw.id, cardIds));
    await expect(withTx((tx) => assertLoansUsable(tx, u.userId, gws[4].gw.id, cardIds))).rejects.toMatchObject({ code: "LOAN_ENDED" });

    // Loans stay while any of those gameweeks is unsettled, then retire.
    await db.cardInstance.updateMany({ where: { lock: "COMPETITION" }, data: { lock: "NONE", lockRef: null } });
    await db.competition.updateMany({ where: { id: { in: gws.slice(0, 3).map((g) => g.open.id) } }, data: { status: "SETTLED" } });
    expect(await expireLoans([u.userId])).toBe(0);
    await db.competition.update({ where: { id: gws[3].open.id }, data: { status: "SETTLED" } });
    expect(await expireLoans([u.userId])).toBe(2);
    const after = await db.cardInstance.findMany({ where: { id: { in: cardIds } } });
    expect(after.every((c) => c.supplyState === "RETIRED" && c.ownerId === null)).toBe(true);
    expect(await db.cardOwnership.count({ where: { cardId: { in: cardIds }, releasedAt: null } })).toBe(0);
  });
});
