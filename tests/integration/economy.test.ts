import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { completeChallenge, eligibleCards } from "@/server/challenges";
import { submitEntry, updateCompetitionRules, withdrawEntry } from "@/server/competitions";
import { db, withTx } from "@/server/db";
import { claimDrop, dropStatus, scheduleDrop } from "@/server/drops";
import { grantPack, openPack } from "@/server/packs";
import { supplyReport } from "@/server/supply";
import { balancesFor, credit } from "@/server/wallet";
import { buildWorld, makeUser, resetDb } from "./fixtures";

const ENV = { ...process.env };
beforeEach(async () => {
  await resetDb();
  await buildWorld();
});
afterEach(() => {
  process.env = { ...ENV };
});

async function bronzePack(userId: string, n = 1) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const ent = await withTx((tx) => grantPack(tx, { userId, skuCode: "football-bronze", source: "DEV", sourceRef: `dev:${userId}:${i}:${Math.random()}` }));
    ids.push(...(await openPack(userId, ent.id)).cards.map((c) => c.cardId));
  }
  return ids;
}

describe("challenges", () => {
  it("hands in exactly the right cards for bonus MP, recycles them, and is idempotent", async () => {
    const { userId } = await makeUser();
    await bronzePack(userId, 2);
    const ch = await db.challenge.create({ data: { code: "t-three", name: "Three", description: "", criteria: { count: 3 }, rewardMinor: 100 } });
    const { cards } = await eligibleCards(userId, ch.id);
    const pick = cards.slice(0, 3).map((c) => c.id);
    await expect(completeChallenge(userId, ch.id, pick.slice(0, 2), "k0")).rejects.toMatchObject({ code: "COUNT" });
    await completeChallenge(userId, ch.id, pick, "k1");
    await completeChallenge(userId, ch.id, pick, "k1");
    const bal = await balancesFor(userId);
    expect(bal.bonus).toBe(100);
    expect(bal.cash).toBe(0);
    const after = await db.cardInstance.findMany({ where: { id: { in: pick } } });
    expect(after.every((c) => c.supplyState === "RECIRCULATING" && c.ownerId === null)).toBe(true);
    expect((await supplyReport()).reconciled).toBe(true);
  });

  it("starter cards don't count unless the challenge allows them, and are retired (not recycled) when they do", async () => {
    const { userId, starterEntitlementId } = await makeUser();
    const starter = (await openPack(userId, starterEntitlementId)).cards.map((c) => c.cardId);
    const strict = await db.challenge.create({ data: { code: "t-strict", name: "S", description: "", criteria: { count: 2 }, rewardMinor: 100 } });
    await expect(completeChallenge(userId, strict.id, starter.slice(0, 2), "s1")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    const loose = await db.challenge.create({ data: { code: "t-loose", name: "L", description: "", criteria: { count: 2, includeUntradeable: true }, rewardMinor: 100 } });
    await completeChallenge(userId, loose.id, starter.slice(0, 2), "s2");
    const after = await db.cardInstance.findMany({ where: { id: { in: starter.slice(0, 2) } } });
    expect(after.every((c) => c.supplyState === "RETIRED")).toBe(true);
  });

  it("respects max-per-manager and tier rules", async () => {
    const { userId } = await makeUser();
    await bronzePack(userId, 2);
    const ch = await db.challenge.create({ data: { code: "t-gold", name: "G", description: "", criteria: { count: 1, tiers: ["GOLD"] }, rewardMinor: 100, maxPerUser: 1 } });
    const bronze = await db.cardInstance.findFirstOrThrow({ where: { ownerId: userId, template: { category: "BRONZE" } } });
    await expect(completeChallenge(userId, ch.id, [bronze.id], "g1")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });
});

describe("free pack drops", () => {
  it("one claim per manager per drop; nothing outside the window", async () => {
    const admin = await makeUser("adm");
    const { userId } = await makeUser();
    const drop = await scheduleDrop(admin.userId, { title: "Matchday freebie", startsAt: new Date(Date.now() - 60_000), hours: 24 });
    await expect(scheduleDrop(admin.userId, { title: "Overlap", startsAt: new Date(), hours: 2 })).rejects.toMatchObject({ code: "CLASH" });
    const [a, b] = await Promise.all([claimDrop(userId, drop.id), claimDrop(userId, drop.id)]);
    expect(a.id).toBe(b.id);
    expect((await dropStatus(userId))?.claimed).toBe(true);
    await expect(claimDrop(userId, drop.id, new Date(Date.now() + 25 * 3_600_000))).rejects.toMatchObject({ code: "CLOSED" });
  });
});

describe("match entry fees and requirements", () => {
  async function openComp() {
    const gw = await db.gameweek.create({ data: { sportId: (await db.sport.findFirstOrThrow()).id, season: "t", number: 1, startsAt: new Date(), endsAt: new Date(Date.now() + 3 * 86_400_000), status: "OPEN" } });
    return db.competition.create({
      data: { sportId: gw.sportId, gameweekId: gw.id, code: `c-${Math.random()}`, name: "Cup", format: "OPEN", rosterRules: "football-roster-v3", scoringRules: "football-scoring-v2-draft", entryOpensAt: new Date(), locksAt: new Date(Date.now() + 86_400_000), status: "OPEN" },
    });
  }
  async function squad(userId: string) {
    const starterPack = await db.packEntitlement.findFirstOrThrow({ where: { userId, source: "STARTER" } });
    await openPack(userId, starterPack.id);
    const cards = await db.cardInstance.findMany({ where: { ownerId: userId }, include: { template: { include: { player: true } } } });
    const by = (p: string) => cards.filter((c) => c.template.player.position === p);
    const starters = [...by("GK").slice(0, 1), ...by("DEF").slice(0, 2), ...by("MID").slice(0, 2), ...by("ATT").slice(0, 2)];
    const bench = cards.filter((c) => !starters.includes(c)).slice(0, 4);
    return { formation: "2-2-2", starters: starters.map((c) => ({ cardId: c.id, position: c.template.player.position })), bench: bench.map((c) => c.id) };
  }

  it("paid entry is blocked until PAID_ENTRY is cleared; then charged once and refunded on withdrawal", async () => {
    const admin = await makeUser("adm2");
    const { userId } = await makeUser();
    const comp = await openComp();
    await updateCompetitionRules(admin.userId, comp.id, { entryFeeMinor: 200, requirements: {} });
    const sub = await squad(userId);
    await expect(submitEntry(userId, comp.id, sub)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });

    process.env.LEGAL_GATES_CLEARED = "PAID_ENTRY";
    process.env.FLAG_PAID_ENTRY = "true";
    await withTx((tx) => credit(tx, { userId, amountMinor: 150, kind: "CHALLENGE_REWARD", refId: "b1" }));
    await withTx((tx) => credit(tx, { userId, amountMinor: 100, kind: "DEPOSIT", bucket: "CASH", refId: "c1" }));
    await submitEntry(userId, comp.id, sub);
    await submitEntry(userId, comp.id, sub); // editing the squad doesn't charge again
    expect(await balancesFor(userId)).toMatchObject({ bonus: 0, cash: 50 });
    await expect(updateCompetitionRules(admin.userId, comp.id, { entryFeeMinor: 300, requirements: {} })).rejects.toMatchObject({ code: "HAS_ENTRIES" });
    await withdrawEntry(userId, comp.id);
    expect(await balancesFor(userId)).toMatchObject({ bonus: 150, cash: 100 });
  });

  it("admin requirements (e.g. Bronze only, max per club) are enforced", async () => {
    const admin = await makeUser("adm3");
    const { userId } = await makeUser();
    const comp = await openComp();
    await updateCompetitionRules(admin.userId, comp.id, { entryFeeMinor: 0, requirements: { maxPerClub: 1 } });
    const sub = await squad(userId);
    await expect(submitEntry(userId, comp.id, sub)).rejects.toMatchObject({ code: "SQUAD_INVALID" });
  });
});

describe("welcome gifts", () => {
  it("Silver pack on day 3 and a lucky Gold on day 7 — once each, untradeable", async () => {
    const { grantDueWelcomePacks } = await import("@/server/welcome");
    const { userId } = await makeUser();
    const joined = (await db.user.findUniqueOrThrow({ where: { id: userId } })).createdAt.getTime();
    const day = 86_400_000;
    expect(await grantDueWelcomePacks(userId, new Date(joined + 2 * day))).toBe(0);
    expect(await grantDueWelcomePacks(userId, new Date(joined + 3 * day + 1))).toBe(1);
    expect(await grantDueWelcomePacks(userId, new Date(joined + 3 * day + 2))).toBe(0);
    expect(await grantDueWelcomePacks(userId, new Date(joined + 7 * day + 1))).toBe(1);
    const ents = await db.packEntitlement.findMany({ where: { userId, sourceRef: { startsWith: "welcome:" } }, include: { packSku: true } });
    expect(ents.map((e) => e.packSku.code).sort()).toEqual(["football-welcome-gold", "football-welcome-silver"]);
    const gold = await openPack(userId, ents.find((e) => e.packSku.code === "football-welcome-gold")!.id);
    expect(gold.cards).toHaveLength(1);
    expect(gold.cards[0].category).toBe("GOLD");
    const silver = await openPack(userId, ents.find((e) => e.packSku.code === "football-welcome-silver")!.id);
    expect(silver.cards).toHaveLength(6);
    const cards = await db.cardInstance.findMany({ where: { id: { in: [...gold.cards, ...silver.cards].map((c) => c.cardId) } } });
    expect(cards.every((c) => c.tradeStatus === "NON_TRADEABLE")).toBe(true);
  });
});

describe("winnings", () => {
  it("only £ winnings can be withdrawn — never MP; rejected withdrawals return the winnings", async () => {
    const { creditWinnings, processWithdrawal, requestWithdrawal } = await import("@/server/wallet");
    process.env.LEGAL_GATES_CLEARED = "WITHDRAWALS";
    process.env.FLAG_WITHDRAWALS = "true";
    const admin = await makeUser("adm5");
    const { userId } = await makeUser();
    await db.user.update({ where: { id: userId }, data: { fullName: "Test Person", dateOfBirth: new Date("1990-01-01"), addressLine1: "1 Road", city: "Leeds", postcode: "LS1 1AA" } });
    await withTx((tx) => credit(tx, { userId, amountMinor: 5000, kind: "DEPOSIT", bucket: "CASH", refId: "dep" }));
    await expect(requestWithdrawal(userId, 1000)).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    await withTx((tx) => creditWinnings(tx, { userId, amountMinor: 1500, refId: "prize-1" }));
    await expect(requestWithdrawal(userId, 900)).rejects.toMatchObject({ code: "MIN" });
    const w = await requestWithdrawal(userId, 1200);
    expect(await balancesFor(userId)).toMatchObject({ winnings: 300, total: 5000 });
    await processWithdrawal(admin.userId, w.id, "REJECTED");
    expect(await balancesFor(userId)).toMatchObject({ winnings: 1500, total: 5000 });
  });

  it("admin £ prizes parse from '1=10, 2-3=5'", async () => {
    const { parsePrizes } = await import("@/server/competitions");
    expect(parsePrizes("1=10, 2-3=5")).toEqual([
      { rankFrom: 1, rankTo: 1, cashMinor: 1000 },
      { rankFrom: 2, rankTo: 3, cashMinor: 500 },
    ]);
    expect(() => parsePrizes("first=10")).toThrow();
  });
});

describe("founding members", () => {
  it("sign-ups get sequential founding numbers while founding sign-ups are open, none after", async () => {
    const a = await makeUser("founder1");
    const b = await makeUser("founder2");
    const nums = await db.user.findMany({ where: { id: { in: [a.userId, b.userId] } }, select: { foundingNumber: true } });
    expect(nums.map((n) => n.foundingNumber).sort()).toEqual([1, 2]);
    process.env.FLAG_FOUNDING_SIGNUPS = "false";
    const c = await makeUser("latecomer");
    expect((await db.user.findUniqueOrThrow({ where: { id: c.userId } })).foundingNumber).toBeNull();
  });

  it("founders-only matches reject everyone else", async () => {
    const { updateCompetitionRules: rules, submitEntry: enter } = await import("@/server/competitions");
    process.env.FLAG_FOUNDING_SIGNUPS = "false";
    const admin = await makeUser("adm7");
    const { userId } = await makeUser("nonfounder");
    const sport = await db.sport.findFirstOrThrow();
    const gw = await db.gameweek.create({ data: { sportId: sport.id, season: "f", number: 1, startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), status: "OPEN" } });
    const comp = await db.competition.create({ data: { sportId: sport.id, gameweekId: gw.id, code: "freeroll", name: "Founders Freeroll", format: "OPEN", rosterRules: "football-roster-v3", scoringRules: "football-scoring-v2-draft", entryOpensAt: new Date(), locksAt: new Date(Date.now() + 86_400_000), status: "OPEN" } });
    await rules(admin.userId, comp.id, { entryFeeMinor: 0, requirements: { foundersOnly: true }, prizes: "1=10" });
    await expect(enter(userId, comp.id, { formation: "2-2-2", starters: [], bench: [] })).rejects.toMatchObject({ code: "FOUNDERS_ONLY" });
    expect((await db.competition.findUniqueOrThrow({ where: { id: comp.id } })).rewards).toEqual([{ rankFrom: 1, rankTo: 1, cashMinor: 1000 }]);
  });

});

describe("launch period: untradeable cards", () => {
  it("before paid packs, cards from packs are untradeable but still count for sets and challenges; handed-in cards return tradeable", async () => {
    const { userId } = await makeUser("launch1");
    const ids = await bronzePack(userId, 1);
    const cards = await db.cardInstance.findMany({ where: { id: { in: ids } } });
    expect(cards.every((c) => c.tradeStatus === "NON_TRADEABLE")).toBe(true);
    const ch = await db.challenge.create({ data: { code: "t-launch", name: "L", description: "", criteria: { count: 2 }, rewardMinor: 100 } });
    await completeChallenge(userId, ch.id, ids.slice(0, 2), "launch-k");
    const back = await db.cardInstance.findMany({ where: { id: { in: ids.slice(0, 2) } } });
    expect(back.every((c) => c.supplyState === "RECIRCULATING" && c.tradeStatus === "TRADEABLE")).toBe(true);
  });

  it("once paid packs are live, new cards are tradeable; lockAllHeldCards locks what's already held", async () => {
    const { lockAllHeldCards } = await import("@/server/launch");
    process.env.LEGAL_GATES_CLEARED = "PAID_PACKS";
    process.env.FLAG_PAID_PACKS = "true";
    const { userId } = await makeUser("launch2");
    const ids = await bronzePack(userId, 1);
    expect((await db.cardInstance.findMany({ where: { id: { in: ids } } })).every((c) => c.tradeStatus === "TRADEABLE")).toBe(true);
    expect(await lockAllHeldCards()).toBe(ids.length);
    expect((await db.cardInstance.findMany({ where: { id: { in: ids } } })).every((c) => c.tradeStatus === "NON_TRADEABLE")).toBe(true);
  });
});
