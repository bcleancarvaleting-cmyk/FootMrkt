import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { completeChallenge, eligibleCards, ensureDefaultChallenges } from "@/server/challenges";
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
  it("hands in exactly the right cards for bonus MX, recycles them, and is idempotent", async () => {
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

  it("free/starter cards count by default (and are retired, not recycled); a challenge can exclude them", async () => {
    const { userId, starterEntitlementId } = await makeUser();
    const starter = (await openPack(userId, starterEntitlementId)).cards.map((c) => c.cardId);
    const strict = await db.challenge.create({ data: { code: "t-strict", name: "S", description: "", criteria: { count: 2, includeUntradeable: false }, rewardMinor: 100 } });
    await expect(completeChallenge(userId, strict.id, starter.slice(0, 2), "s1")).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    const loose = await db.challenge.create({ data: { code: "t-loose", name: "L", description: "", criteria: { count: 2 }, rewardMinor: 100 } });
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

describe("upgrade challenges", () => {
  it("5 Bronze trade up for a Choice of Silver", async () => {
    const { userId } = await makeUser();
    await bronzePack(userId, 3);
    await ensureDefaultChallenges();
    const up = await db.challenge.findUniqueOrThrow({ where: { code: "upgrade-silver" } });
    const { cards } = await eligibleCards(userId, up.id);
    expect(cards.length).toBeGreaterThanOrEqual(5);
    expect(cards.every((c) => c.category === "BRONZE")).toBe(true);
    const done = await completeChallenge(userId, up.id, cards.slice(0, 5).map((c) => c.id), "up1");
    const ent = await db.packEntitlement.findFirst({ where: { userId, sourceRef: `challenge:${done.id}` }, include: { packSku: true } });
    expect(ent?.packSku.code).toBe("football-silver-pick");
    const gold = await db.challenge.findUniqueOrThrow({ where: { code: "upgrade-gold" } });
    expect(gold.rewardPackSku).toBe("football-gold-pick");
  });
});

describe("free pack drops", () => {
  it("one claim per manager per gift; nothing outside the window", async () => {
    const admin = await makeUser("adm");
    const { userId } = await makeUser();
    const drop = await scheduleDrop(admin.userId, { title: "Matchday freebie", startsAt: new Date(Date.now() - 60_000), hours: 24 });
    await expect(scheduleDrop(admin.userId, { title: "Overlap", startsAt: new Date(), hours: 2 })).rejects.toMatchObject({ code: "CLASH" });
    const [a, b] = await Promise.all([claimDrop(userId, drop.id), claimDrop(userId, drop.id)]);
    expect(a.entitlement!.id).toBe(b.entitlement!.id);
    expect((await dropStatus(userId))?.claimed).toBe(true);
    await expect(claimDrop(userId, drop.id, new Date(Date.now() + 25 * 3_600_000))).rejects.toMatchObject({ code: "CLOSED" });
  });

  it("gifts can be a pick, a gift pack, XP or earned MX — each claimed once", async () => {
    const admin = await makeUser("adm14");
    const { userId } = await makeUser("gifted");
    const day = 86_400_000;
    const t0 = Date.now() + 10 * day;
    const xp = await scheduleDrop(admin.userId, { title: "XP boost", giftType: "XP", amount: 500, startsAt: new Date(t0), hours: 24 });
    const mx = await scheduleDrop(admin.userId, { title: "MX gift", giftType: "MX", amount: 300, startsAt: new Date(t0 + day), hours: 24 });
    const pick = await scheduleDrop(admin.userId, { title: "Christmas", giftType: "PACK", skuCode: "football-silver-pick", startsAt: new Date(t0 + 2 * day), hours: 24 });
    await expect(scheduleDrop(admin.userId, { title: "Bad", giftType: "PACK", skuCode: "football-eng-gold", startsAt: new Date(t0 + 3 * day), hours: 24 })).rejects.toMatchObject({ code: "BAD_PACK" });
    await claimDrop(userId, xp.id, new Date(t0 + 1000));
    await claimDrop(userId, xp.id, new Date(t0 + 2000));
    await claimDrop(userId, mx.id, new Date(t0 + day + 1000));
    expect(await balancesFor(userId)).toMatchObject({ xp: 500, earned: 300 });
    const p = await claimDrop(userId, pick.id, new Date(t0 + 2 * day + 1000));
    expect(p.kind).toBe("PACK");
    const { pickOptions } = await import("@/server/picks");
    const opts = await pickOptions(userId, p.entitlement!.id);
    expect(opts.category).toBe("SILVER");
    expect(opts.playerIds).toHaveLength(3);
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
    const starterPack = await db.packEntitlement.findFirstOrThrow({ where: { userId, source: "STARTER", packSku: { kind: "STARTER" } } });
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
  it("none by default (the sign-up offer replaced them); a gift switched on in Admin is granted once, untradeable", async () => {
    const { grantDueWelcomePacks } = await import("@/server/welcome");
    const { userId } = await makeUser();
    const joined = (await db.user.findUniqueOrThrow({ where: { id: userId } })).createdAt.getTime();
    const day = 86_400_000;
    expect(await grantDueWelcomePacks(userId, new Date(joined + 30 * day))).toBe(0);
    await db.welcomeGift.create({ data: { skuCode: "football-welcome-mix", afterDays: 3 } });
    expect(await grantDueWelcomePacks(userId, new Date(joined + 2 * day))).toBe(0);
    expect(await grantDueWelcomePacks(userId, new Date(joined + 3 * day + 1))).toBe(1);
    expect(await grantDueWelcomePacks(userId, new Date(joined + 3 * day + 2))).toBe(0);
    const ent = await db.packEntitlement.findFirstOrThrow({ where: { userId, sourceRef: { startsWith: "welcome:" } } });
    const mix = await openPack(userId, ent.id);
    expect(mix.cards.map((c) => c.category).sort()).toEqual(["BRONZE", "BRONZE", "GOLD", "SILVER", "SILVER"]);
    const cards = await db.cardInstance.findMany({ where: { id: { in: mix.cards.map((c) => c.cardId) } } });
    expect(cards.every((c) => c.tradeStatus === "NON_TRADEABLE")).toBe(true);
  });
});

describe("winnings", () => {
  it("only £ winnings can be withdrawn — never MX; rejected withdrawals return the winnings", async () => {
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
    await rules(admin.userId, comp.id, { entryFeeMinor: 0, requirements: { foundersOnly: true, freeCardsOnly: true }, prizes: "1=10" });
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

describe("prize guardrails", () => {
  async function comp() {
    const sport = await db.sport.findFirstOrThrow();
    const gw = await db.gameweek.create({ data: { sportId: sport.id, season: "g", number: 1, startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), status: "OPEN" } });
    return db.competition.create({ data: { sportId: sport.id, gameweekId: gw.id, code: `g-${Math.random()}`, name: "G", format: "OPEN", rosterRules: "football-roster-v3", scoringRules: "football-scoring-v2-draft", entryOpensAt: new Date(), locksAt: new Date(Date.now() + 86_400_000), status: "OPEN" } });
  }

  it("£ prizes need free entry (and free cards only when 'Cash prizes with any cards' is off)", async () => {
    const admin = await makeUser("adm11");
    const c = await comp();
    // On (the default since 11 Nov 2026): any cards can win cash, but never in a paid-entry match.
    await updateCompetitionRules(admin.userId, c.id, { entryFeeMinor: 0, requirements: {}, prizes: "1=10" });
    await db.appSetting.create({ data: { key: "cashAnyCards", value: 0 } });
    await expect(updateCompetitionRules(admin.userId, c.id, { entryFeeMinor: 0, requirements: {}, prizes: "1=10" })).rejects.toMatchObject({ code: "PRIZE_RULES" });
    await expect(updateCompetitionRules(admin.userId, c.id, { entryFeeMinor: 200, requirements: { freeCardsOnly: true }, prizes: "1=10" })).rejects.toMatchObject({ code: "PRIZE_RULES" });
    await updateCompetitionRules(admin.userId, c.id, { entryFeeMinor: 0, requirements: { freeCardsOnly: true }, prizes: "1=10" });
    await updateCompetitionRules(admin.userId, c.id, { entryFeeMinor: 200, requirements: {}, prizes: "" });
  });

  it("free-cards-only matches reject bought or pack cards", async () => {
    const admin = await makeUser("adm12");
    const { userId } = await makeUser("free1");
    const c = await comp();
    await updateCompetitionRules(admin.userId, c.id, { entryFeeMinor: 0, requirements: { freeCardsOnly: true }, prizes: "1=10" });
    await bronzePack(userId, 2);
    const starter = await db.packEntitlement.findFirstOrThrow({ where: { userId, source: "STARTER", packSku: { kind: "STARTER" } } });
    await openPack(userId, starter.id);
    const cards = await db.cardInstance.findMany({ where: { ownerId: userId }, include: { template: { include: { player: true } } } });
    const pick = (edition: string) => {
      const pool = cards.filter((x) => x.template.edition === edition);
      const by = (p: string, n: number) => pool.filter((x) => x.template.player.position === p).slice(0, n);
      const starters = [...by("GK", 1), ...by("DEF", 2), ...by("MID", 2), ...by("ATT", 2)];
      return { formation: "2-2-2", starters: starters.map((x) => ({ cardId: x.id, position: x.template.player.position })), bench: pool.filter((x) => !starters.includes(x)).slice(0, 4).map((x) => x.id) };
    };
    await submitEntry(userId, c.id, pick("STARTER"));
    const mixed = pick("STARTER");
    const bought = cards.find((x) => x.template.edition === "STANDARD" && x.template.player.position === "ATT");
    if (bought) {
      mixed.starters[6] = { cardId: bought.id, position: "ATT" };
      await expect(submitEntry(userId, c.id, mixed)).rejects.toMatchObject({ code: "SQUAD_INVALID" });
    }
  });
});

describe("XP", () => {
  it("XP converts to earned MX at the admin rate (default 500 XP = 1 MX); admins can change it", async () => {
    const { creditXp, convertXp } = await import("@/server/wallet");
    const { setSetting } = await import("@/server/settings");
    const admin = await makeUser("admxp");
    const { userId } = await makeUser("xp1");
    await withTx((tx) => creditXp(tx, { userId, xp: 1250, refId: "xp-a" }));
    await withTx((tx) => creditXp(tx, { userId, xp: 1250, refId: "xp-a" })); // idempotent
    await expect(convertXp(userId, 400)).rejects.toMatchObject({ code: "MIN" });
    await expect(convertXp(userId, 1500)).rejects.toMatchObject({ code: "INSUFFICIENT_XP" });
    expect(await convertXp(userId, 1000)).toEqual({ xpUsed: 1000, mxMinor: 200 });
    expect(await balancesFor(userId)).toMatchObject({ xp: 250, earned: 200, bought: 0 });
    await setSetting(admin.userId, "xpPerMx", 250);
    expect(await convertXp(userId, 250)).toEqual({ xpUsed: 250, mxMinor: 100 });
    await expect(setSetting(admin.userId, "xpPerMx", 1)).rejects.toMatchObject({ code: "RANGE" });
  });

});

describe("starter period, Gold pick and referrals", () => {
  it("Choice of Gold offers the same three Golds every time and keeps exactly one", async () => {
    const { pickOptions, choosePick } = await import("@/server/picks");
    const { GOLD_PICK_CODE } = await import("@/config/packs");
    const { userId } = await makeUser("picker");
    const ent = await withTx((tx) => grantPack(tx, { userId, skuCode: GOLD_PICK_CODE, source: "REWARD", sourceRef: `pick:${userId}` }));
    await expect(openPack(userId, ent.id)).rejects.toMatchObject({ code: "USE_PICK" });
    const a = await pickOptions(userId, ent.id);
    const b = await pickOptions(userId, ent.id);
    expect(a.playerIds).toHaveLength(3);
    expect(b.playerIds).toEqual(a.playerIds);
    await expect(choosePick(userId, ent.id, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ code: "NOT_OFFERED" });
    const r = await choosePick(userId, ent.id, a.playerIds[1]);
    const card = await db.cardInstance.findUniqueOrThrow({ where: { id: r.cardId }, include: { template: true } });
    expect(card).toMatchObject({ ownerId: userId, tradeStatus: "NON_TRADEABLE" });
    expect(card.template).toMatchObject({ playerId: a.playerIds[1], category: "GOLD", edition: "STARTER" });
    await expect(choosePick(userId, ent.id, a.playerIds[0])).rejects.toMatchObject({ code: "ALREADY_PICKED" });
  });

  it("a referrer gets one Choice of Bronze (admin-set) when each friend plays their first match", async () => {
    const { registerUser } = await import("@/server/auth/accounts");
    const referrer = await makeUser("inviter");
    const friend = await registerUser({ email: "friend@test.dev", password: "correct-horse-battery", displayName: "friend1", ref: "INVITER" });
    expect(friend.user.referredById).toBe(referrer.userId);
    expect(await db.packEntitlement.count({ where: { userId: referrer.userId, sourceRef: { startsWith: "referral:" } } })).toBe(0);
    const sport = await db.sport.findFirstOrThrow();
    const gw = await db.gameweek.create({ data: { sportId: sport.id, season: "r", number: 1, startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), status: "OPEN" } });
    const comp = await db.competition.create({ data: { sportId: sport.id, gameweekId: gw.id, code: "ref-c", name: "R", format: "OPEN", rosterRules: "football-roster-v3", scoringRules: "football-scoring-v2-draft", entryOpensAt: new Date(), locksAt: new Date(Date.now() + 86_400_000), status: "OPEN" } });
    await openPack(friend.user.id, friend.starterEntitlementId);
    const cards = await db.cardInstance.findMany({ where: { ownerId: friend.user.id }, include: { template: { include: { player: true } } } });
    const by = (p: string, n: number) => cards.filter((x) => x.template.player.position === p).slice(0, n);
    const starters = [...by("GK", 1), ...by("DEF", 2), ...by("MID", 2), ...by("ATT", 2)];
    const sub = { formation: "2-2-2", starters: starters.map((x) => ({ cardId: x.id, position: x.template.player.position })), bench: cards.filter((x) => !starters.includes(x)).slice(0, 4).map((x) => x.id) };
    await submitEntry(friend.user.id, comp.id, sub);
    await submitEntry(friend.user.id, comp.id, sub);
    const packs = await db.packEntitlement.findMany({ where: { userId: referrer.userId, sourceRef: { startsWith: "referral:" } }, include: { packSku: true } });
    expect(packs.map((p) => p.packSku.code)).toEqual(["football-bronze-pick"]);
    const { pickOptions } = await import("@/server/picks");
    expect((await pickOptions(referrer.userId, packs[0].id)).category).toBe("BRONZE");
  });
});

describe("club binders", () => {
  it("every club gets a 5-player binder, and free (untradeable) copies complete it — free copies used first", async () => {
    const { ensureClubBinders, setProgress, completeSet } = await import("@/server/collections");
    const { ensureTemplate, mintInstances } = await import("@/server/cards");
    expect(await ensureClubBinders()).toBe(await db.club.count());
    expect(await ensureClubBinders()).toBe(0);
    const { userId } = await makeUser("binder1");
    const binder = await db.collectionSet.findFirstOrThrow({ where: { code: { startsWith: "binder-" } }, include: { requirements: { include: { template: true } } } });
    expect(binder.requirements).toHaveLength(5);
    // Give the manager a free STARTER-edition copy of each binder player.
    const ids: string[] = [];
    for (const r of binder.requirements) {
      await withTx(async (tx) => {
        const tpl = await ensureTemplate(tx, r.template.playerId, r.template.category, "STARTER");
        const [id] = await mintInstances(tx, { templateId: tpl.id, count: 1, state: "HELD", ownerId: userId, tradeStatus: "NON_TRADEABLE" });
        await tx.cardOwnership.create({ data: { cardId: id, userId, acquiredVia: "WEEKLY_PACK" } });
        ids.push(id);
      });
    }
    const p = (await setProgress(userId)).find((x) => x.set.id === binder.id)!;
    expect(p.complete).toBe(true);
    await completeSet(userId, binder.id, "binder-k");
    expect(await balancesFor(userId)).toMatchObject({ earned: 1000 });
    const after = await db.cardInstance.findMany({ where: { id: { in: ids } } });
    expect(after.every((c) => c.supplyState === "RETIRED")).toBe(true);
  });
});

describe("emails", () => {
  it("emails are logged in the outbox (sent when a provider is set) and dedupe", async () => {
    const { sendEmail, emailUser } = await import("@/server/email/send");
    const { userId } = await makeUser("mailer");
    await sendEmail("welcome", { userId, email: "mailer@test.dev" }, { name: "mailer" }, "w1");
    await sendEmail("welcome", { userId, email: "mailer@test.dev" }, { name: "mailer" }, "w1");
    await emailUser(userId, "packReady", { pack: "Squad Boost" });
    const logs = await db.emailLog.findMany({ where: { userId } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.status === "LOGGED")).toBe(true);
    expect(logs.map((l) => l.subject).sort()).toEqual(["Welcome to MATCHX, mailer", "Your Squad Boost is ready"]);
  });
});
