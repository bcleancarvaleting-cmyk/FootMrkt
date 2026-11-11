import { beforeEach, describe, expect, it } from "vitest";
import { MAX_SUPPLY } from "@/config/tiers";
import { db } from "@/server/db";
import { postMessage, removeMessage, reportMessage, listMessages } from "@/server/chat";
import { inviteModerator, keepMessage, respondToInvite, revokeModerator } from "@/server/moderation";
import { openPack } from "@/server/packs";
import { applyMarketValues } from "@/server/tiering";
import { supplyReport } from "@/server/supply";
import { claimWeeklyPack } from "@/server/weekly";
import { setProgress } from "@/server/collections";
import { buildWorld, makeUser, resetDb } from "./fixtures";

beforeEach(async () => {
  await resetDb();
  await buildWorld();
});

async function admin() {
  const u = await makeUser();
  await db.user.update({ where: { id: u.userId }, data: { role: "ADMIN" } });
  return u.userId;
}

describe("weekly free pack", () => {
  it("one per week, untradeable minted cards, a new one next week", async () => {
    const { userId } = await makeUser();
    const now = new Date("2026-11-10T12:00:00Z");
    const a = await claimWeeklyPack(userId, now);
    const b = await claimWeeklyPack(userId, new Date("2026-11-14T20:00:00Z"));
    expect(b.id).toBe(a.id);
    const opened = await openPack(userId, a.id);
    expect(opened.cards).toHaveLength(6);
    const cards = await db.cardInstance.findMany({ where: { id: { in: opened.cards.map((c) => c.cardId) } }, include: { template: true, ownerships: true } });
    expect(cards.every((c) => c.tradeStatus === "NON_TRADEABLE" && c.template.edition === "STARTER")).toBe(true);
    expect(cards.every((c) => c.ownerships[0].acquiredVia === "WEEKLY_PACK")).toBe(true);
    const next = await claimWeeklyPack(userId, new Date("2026-11-17T09:00:00Z"));
    expect(next.id).not.toBe(a.id);
    expect(await db.packEntitlement.count({ where: { userId, source: "WEEKLY" } })).toBe(2);
  });

  it("free (weekly) cards count towards sets (product decision 10 Nov 2026)", async () => {
    const { userId } = await makeUser();
    const ent = await claimWeeklyPack(userId);
    const opened = await openPack(userId, ent.id);
    const card = await db.cardInstance.findUniqueOrThrow({ where: { id: opened.cards[0].cardId }, include: { template: true } });
    const std = await db.cardTemplate.findFirstOrThrow({ where: { playerId: card.template.playerId, edition: "STANDARD" } });
    const sportId = (await db.sport.findFirstOrThrow()).id;
    await db.collectionSet.create({ data: { sportId, code: "w", name: "W", description: "", requirements: { create: [{ templateId: std.id }] } } });
    expect((await setProgress(userId))[0].complete).toBe(true);
  });
});

describe("moderators by invitation", () => {
  it("admin invites, manager accepts, can moderate; revoke removes access", async () => {
    const adminId = await admin();
    const mod = await makeUser("helper");
    const writer = await makeUser("writer");
    await expect(removeMessage({ id: mod.userId, role: "USER" }, (await postMessage(writer.userId, "dugout", "hi")).id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { invite } = await inviteModerator(adminId, "helper");
    await expect(inviteModerator(adminId, "helper")).rejects.toMatchObject({ code: "PENDING" });
    await expect(inviteModerator(mod.userId, "writer")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await respondToInvite(mod.userId, invite.id, true);
    const me = await db.user.findUniqueOrThrow({ where: { id: mod.userId } });
    expect(me.role).toBe("MODERATOR");

    const msg = await postMessage(writer.userId, "dugout", "borderline");
    for (let i = 0; i < 3; i++) await reportMessage((await makeUser()).userId, msg.id);
    expect((await listMessages("dugout")).find((m) => m.id === msg.id)?.removed).toBe(true);
    await keepMessage(me, msg.id);
    expect((await listMessages("dugout")).find((m) => m.id === msg.id)?.removed).toBe(false);
    await removeMessage(me, msg.id);

    await revokeModerator(adminId, mod.userId);
    expect((await db.user.findUniqueOrThrow({ where: { id: mod.userId } })).role).toBe("USER");
    expect(await db.adminAuditLog.count({ where: { action: { startsWith: "moderator." } } })).toBe(3);
  });

  it("declined invites leave the role unchanged", async () => {
    const adminId = await admin();
    const u = await makeUser("nothanks");
    const { invite } = await inviteModerator(adminId, "nothanks");
    await respondToInvite(u.userId, invite.id, false);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.userId } })).role).toBe("USER");
    await expect(respondToInvite(u.userId, invite.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("market-value tiering", () => {
  it("re-tiers a player and every card of them moves with them, keeping its serial", async () => {
    const tpl = await db.cardTemplate.findFirstOrThrow({ where: { category: "BRONZE", edition: "STANDARD" } });
    const cards = await db.cardInstance.findMany({ where: { templateId: tpl.id }, select: { id: true, serial: true } });
    const u = await makeUser("holder");
    await db.cardInstance.update({ where: { id: cards[0].id }, data: { supplyState: "HELD", ownerId: u.userId } });
    await db.cardOwnership.create({ data: { cardId: cards[0].id, userId: u.userId, acquiredVia: "PACK", acquiredRef: "test" } });

    // Value rises past the Gold line: the Bronze copies are Gold now.
    const r = await applyMarketValues([{ playerId: tpl.playerId, valueGbp: 45_000_000, source: "test", at: new Date() }]);
    expect(r.retiered).toBe(1);
    const active = await db.cardTemplate.findMany({ where: { playerId: tpl.playerId, edition: "STANDARD", active: true } });
    expect(active.map((t) => t.category)).toEqual(["GOLD"]);
    const after = await db.cardInstance.findMany({ where: { id: { in: cards.map((c) => c.id) } }, include: { template: true } });
    expect(after.every((c) => c.template.category === "GOLD")).toBe(true);
    expect(after.map((c) => c.serial).sort()).toEqual(cards.map((c) => c.serial).sort());
    // Cap is Gold's, but never below what's issued.
    expect(active[0].maxSupply).toBe(Math.max(MAX_SUPPLY.GOLD, cards.length));
    expect((await db.player.findUniqueOrThrow({ where: { id: tpl.playerId } })).marketValueGbp).toBe(45_000_000);
    expect((await applyMarketValues([{ playerId: tpl.playerId, valueGbp: 50_000_000, source: "test", at: new Date() }])).retiered).toBe(0);

    // …and back down again if the value falls; the card stays with its owner.
    await applyMarketValues([{ playerId: tpl.playerId, valueGbp: 5_000_000, source: "test", at: new Date() }]);
    const held = await db.cardInstance.findUniqueOrThrow({ where: { id: cards[0].id }, include: { template: true } });
    expect(held).toMatchObject({ ownerId: u.userId, template: { category: "SILVER" } });
    expect((await supplyReport()).reconciled).toBe(true);
  });

  it("merges into an older template when a player returns to a tier they held before", async () => {
    const tpl = await db.cardTemplate.findFirstOrThrow({ where: { category: "BRONZE", edition: "STANDARD" } });
    const old = await db.cardTemplate.create({ data: { playerId: tpl.playerId, category: "GOLD", edition: "STANDARD", maxSupply: 500, active: false } });
    const ids = (await db.cardInstance.findMany({ where: { templateId: tpl.id } })).map((c) => c.id);
    await applyMarketValues([{ playerId: tpl.playerId, valueGbp: 30_000_000, source: "test", at: new Date() }]);
    const moved = await db.cardInstance.findMany({ where: { id: { in: ids } } });
    expect(moved.every((c) => c.templateId === old.id)).toBe(true);
    expect(new Set(moved.map((c) => c.serial)).size).toBe(ids.length);
    expect((await db.cardTemplate.findUniqueOrThrow({ where: { id: old.id } })).active).toBe(true);
  });
});

describe("pasted market values", () => {
  it("previews tier changes and applies them", async () => {
    const { previewPastedValues, applyPastedValues } = await import("@/server/market-values");
    const bronze = await db.cardTemplate.findFirstOrThrow({ where: { category: "BRONZE", edition: "STANDARD" }, include: { player: { include: { club: true } } } });
    await db.player.update({ where: { id: bronze.playerId }, data: { firstName: "Zebedee", lastName: "Quartermaine" } });
    const name = "Zebedee Quartermaine";
    const text = `${name}\t${bronze.player.club?.name}\t£25.00m\nNobody Here\tSomewhere\t£3.00m`;
    const prev = await previewPastedValues(text);
    expect(prev.rows).toHaveLength(1);
    expect(prev.rows[0]).toMatchObject({ from: "BRONZE", to: "GOLD", valueGbp: 25_000_000 });
    expect(prev.unmatched).toHaveLength(1);
    const adminId = (await makeUser("valuer")).userId;
    const r = await applyPastedValues(text, "test paste", adminId);
    expect(r).toMatchObject({ updated: 1, retiered: 1 });
    expect((await db.player.findUniqueOrThrow({ where: { id: bronze.playerId } })).marketValueSource).toBe("test paste");
  });
});
