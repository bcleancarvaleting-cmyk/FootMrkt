import { z } from "zod";
import { audit } from "./audit";
import { latestDrop } from "./boosters";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { notify } from "./notifications";
import { ensurePublished, grantPack } from "./packs";
import { credit, fmtMp } from "./wallet";

/**
 * Messages and treats for managers who installed the MATCHX app (to the phone too, if they turned
 * notifications on — every message also lands in their in-app notifications). Each is sent once:
 *  - Welcome, about an hour after installing.
 *  - "Boosters land in an hour" each Monday-night-into-Tuesday, before the 9am booster drop.
 *  - (Entrants already get "locks in under an hour" from the weekly rhythm.)
 *  - App-user giveaways: packs and/or earned MX from Admin → App & notifications.
 */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * App-only welcome picks: one pick per league (choose 1 of 4 of its top 50 performers, on loan for
 * the first 4 gameweeks). Given once, when a manager installs MATCHX on their phone.
 */
export async function grantAppPicks(userId: string) {
  const { APP_PICK_LIST } = await import("@/config/packs");
  let added = 0;
  await withTx(async (tx) => {
    for (const code of APP_PICK_LIST) {
      await ensurePublished(tx, code);
      const ref = `app-pick:${code}:${userId}`;
      if (await tx.packEntitlement.findUnique({ where: { sourceRef: ref } })) continue;
      await grantPack(tx, { userId, skuCode: code, source: "STARTER", sourceRef: ref });
      added++;
    }
  });
  if (added) {
    await notify(userId, {
      kind: "APP",
      title: "📱 Your 4 app-only picks are ready",
      body: "Pick a top performer from each league: Premier League, Championship, League One and League Two. They're on loan for your first 4 gameweeks.",
      href: "/packs",
      dedupeKey: `app-picks:${userId}`,
    });
  }
  return added;
}

export async function appMessages(now = new Date()) {
  const out = { welcomed: 0, boosterSoon: 0, giveaways: 0, appPicks: 0 };

  // 0) App picks for phone installs that haven't had them (normally given the moment they install).
  const missing = await db.user.findMany({
    where: { status: "ACTIVE", appPlatform: { in: ["ios", "android"] }, appInstalledAt: { not: null }, packEntitlements: { none: { sourceRef: { startsWith: "app-pick:" } } } },
    select: { id: true },
    take: 200,
  });
  for (const u of missing) if (await grantAppPicks(u.id)) out.appPicks++;

  // 1) Welcome, 1 hour after installing (window of a day so a quiet server still catches up).
  const fresh = await db.user.findMany({
    where: { status: "ACTIVE", appInstalledAt: { lte: new Date(now.getTime() - HOUR), gt: new Date(now.getTime() - DAY) } },
    select: { id: true, displayName: true },
  });
  for (const u of fresh) {
    await notify(u.id, {
      kind: "APP",
      title: `Welcome to MATCHX, ${u.displayName} 👋`,
      body: "You're on the app — you'll hear about boosters, deadlines and app-only giveaways first. Open your packs and pick your seven.",
      href: "/",
      dedupeKey: `app-welcome:${u.id}`,
    });
    out.welcomed++;
  }

  // 2) The hour before the weekly booster drop.
  const next = latestDrop(new Date(now.getTime() + HOUR));
  if (next.at > now && next.at.getTime() - now.getTime() <= HOUR) {
    const users = await db.user.findMany({
      where: { status: "ACTIVE", appInstalledAt: { not: null }, lastSeenAt: { gte: new Date(now.getTime() - 30 * DAY) } },
      select: { id: true },
    });
    for (const u of users) {
      await notify(u.id, {
        kind: "BOOSTER",
        title: "⚡ Boosters land in an hour",
        body: "Your free weekly booster pack drops at 9am. Open it and play it on this week's match.",
        href: "/packs",
        dedupeKey: `booster-soon:${next.key}:${u.id}`,
      });
      out.boosterSoon++;
    }
  }

  // 3) Open giveaways reach anyone who has installed since.
  const open = await db.appGiveaway.findMany({ where: { cancelledAt: null, openUntil: { gt: now } }, select: { id: true } });
  for (const g of open) out.giveaways += await deliverGiveaway(g.id);
  return out;
}

export const GiveawaySchema = z
  .object({
    title: z.string().trim().min(3).max(60),
    message: z.string().trim().min(3).max(200),
    packSku: z.string().trim().optional(),
    mxMinor: z.number().int().min(0).max(10_000),
    openDays: z.number().int().min(0).max(60),
  })
  .refine((d) => d.packSku || d.mxMinor > 0, "Give a pack, some MX, or both.");

export async function createAppGiveaway(adminId: string, input: z.input<typeof GiveawaySchema>, now = new Date()) {
  const d = GiveawaySchema.parse(input);
  if (d.packSku) {
    const { giftPacks } = await import("./welcome");
    if (!giftPacks().some((p) => p.code === d.packSku)) throw new DomainError("BAD_PACK", "Pick one of the free gift packs.");
  }
  const g = await db.appGiveaway.create({
    data: { title: d.title, message: d.message, packSku: d.packSku || null, mxMinor: d.mxMinor, openUntil: d.openDays ? new Date(now.getTime() + d.openDays * DAY) : null, createdBy: adminId },
  });
  await audit(db, { actorId: adminId, action: "app-giveaway.create", entityType: "AppGiveaway", entityId: g.id, after: g });
  const sent = await deliverGiveaway(g.id);
  return { id: g.id, sent };
}

export async function closeAppGiveaway(adminId: string, id: string) {
  await db.appGiveaway.update({ where: { id }, data: { cancelledAt: new Date() } });
  await audit(db, { actorId: adminId, action: "app-giveaway.close", entityType: "AppGiveaway", entityId: id });
}

/** Give the treat to every app user who hasn't had it. Safe to repeat: once per manager. */
export async function deliverGiveaway(id: string) {
  const g = await db.appGiveaway.findUnique({ where: { id } });
  if (!g || g.cancelledAt) return 0;
  const ref = (userId: string) => `app-gift:${g.id}:${userId}`;
  const users = await db.user.findMany({ where: { status: "ACTIVE", appInstalledAt: { not: null } }, select: { id: true } });
  const had = new Set((await db.notification.findMany({ where: { dedupeKey: { in: users.map((u) => ref(u.id)) } }, select: { userId: true } })).map((n) => n.userId));
  let sent = 0;
  for (const u of users.filter((x) => !had.has(x.id))) {
    await withTx(async (tx) => {
      if (g.packSku) await grantPack(tx, { userId: u.id, skuCode: g.packSku, source: "ADMIN_GRANT", sourceRef: ref(u.id) });
      if (g.mxMinor > 0) await credit(tx, { userId: u.id, amountMinor: g.mxMinor, kind: "ADMIN_ADJUSTMENT", refId: ref(u.id), note: `App giveaway: ${g.title}` });
    });
    const what = [g.packSku ? "a free pack" : null, g.mxMinor ? fmtMp(g.mxMinor) : null].filter(Boolean).join(" + ");
    await notify(u.id, { kind: "APP", title: `🎁 ${g.title}`, body: `${g.message} (${what} — for app users only)`, href: g.packSku ? "/packs" : "/account/wallet", dedupeKey: ref(u.id) });
    sent++;
  }
  if (sent) await db.appGiveaway.update({ where: { id }, data: { recipients: { increment: sent } } });
  return sent;
}

export async function appGiveaways(now = new Date()) {
  const rows = await db.appGiveaway.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return rows.map((g) => ({ ...g, open: !g.cancelledAt && !!g.openUntil && g.openUntil > now }));
}
