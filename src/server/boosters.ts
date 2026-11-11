import { randomInt } from "node:crypto";
import { BOOSTERS, BOOSTER_DROP, BOOSTER_KINDS, BOOSTER_LIFETIME_DAYS, type BoosterKind } from "@/config/boosters";
import type { Tx } from "./db";
import { db } from "./db";
import { DomainError } from "./errors";
import { notify } from "./notifications";

/**
 * Weekly booster packs (product decision 11 Nov 2026). Every Tuesday at 9am UK time each active
 * manager gets one free booster pack. Opening it reveals a random booster (rarer ones are less
 * likely). It's played on one match entry and expires 7 days after it landed. Boosters are never
 * sold and can't be used in matches with cash prizes.
 */
const DAY = 86_400_000;

/** Minutes London is ahead of UTC at an instant (0 in winter, 60 in summer). */
function londonOffset(at: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** The latest booster drop at or before `now`: Tuesday 9am London time. */
export function latestDrop(now = new Date()) {
  // Walk back to the most recent Tuesday (London date), then take 9am London on that day.
  for (let back = 0; back < 8; back++) {
    const day = new Date(now.getTime() - back * DAY);
    const london = new Date(day.getTime() + londonOffset(day) * 60_000);
    if (london.getUTCDay() !== BOOSTER_DROP.weekday) continue;
    const key = london.toISOString().slice(0, 10);
    const nineLocal = Date.UTC(london.getUTCFullYear(), london.getUTCMonth(), london.getUTCDate(), BOOSTER_DROP.hour);
    const at = new Date(nineLocal - londonOffset(new Date(nineLocal)) * 60_000);
    if (at <= now) return { key, at };
  }
  // It's Tuesday before 9am: the drop is last week's.
  const lastWeek = new Date(now.getTime() - 7 * DAY);
  return latestDrop(lastWeek);
}

/** Give every active manager this week's pack (once). Active = seen or joined in the last 30 days. */
export async function grantWeeklyBoosters(now = new Date()) {
  const drop = latestDrop(now);
  const expiresAt = new Date(drop.at.getTime() + BOOSTER_LIFETIME_DAYS * DAY);
  if (expiresAt <= now) return 0;
  const since = new Date(now.getTime() - 30 * DAY);
  const users = await db.user.findMany({
    where: { status: "ACTIVE", OR: [{ lastSeenAt: { gte: since } }, { createdAt: { gte: since } }], boosterPacks: { none: { weekKey: drop.key } } },
    select: { id: true },
  });
  if (!users.length) return 0;
  await db.boosterPack.createMany({ data: users.map((u) => ({ userId: u.id, weekKey: drop.key, grantedAt: drop.at, expiresAt })), skipDuplicates: true });
  for (const u of users) {
    await notify(u.id, { kind: "BOOSTER", title: "Your weekly booster pack is here ⚡", body: "Open it to see this week's booster — play it on a match before it expires next Tuesday.", href: "/packs", dedupeKey: `booster:${drop.key}:${u.id}` });
  }
  return users.length;
}

/** A day before a booster expires unused, remind its owner once. */
export async function remindExpiringBoosters(now = new Date()) {
  const due = await db.boosterPack.findMany({ where: { usedEntryId: null, remindedAt: null, expiresAt: { gt: now, lte: new Date(now.getTime() + DAY) } } });
  for (const b of due) {
    const what = b.kind ? `Your ${BOOSTERS[b.kind as BoosterKind].name} booster` : "Your booster pack";
    await notify(b.userId, { kind: "BOOSTER", title: `${what} expires tomorrow`, body: b.kind ? "Add it to a match entry before it's gone." : "Open it and play it on a match before it's gone.", href: "/packs", dedupeKey: `booster-expiry:${b.id}` });
    await db.boosterPack.update({ where: { id: b.id }, data: { remindedAt: now } });
  }
  return due.length;
}

/** Open a pack: reveal a random booster, weighted by its chance. */
export async function openBoosterPack(userId: string, packId: string) {
  const roll = randomInt(100);
  let acc = 0;
  const kind = BOOSTER_KINDS.find((k) => (acc += BOOSTERS[k].chance) > roll) ?? "GOAL_RUSH";
  const r = await db.boosterPack.updateMany({ where: { id: packId, userId, openedAt: null, expiresAt: { gt: new Date() } }, data: { kind, openedAt: new Date() } });
  if (!r.count) {
    const p = await db.boosterPack.findFirst({ where: { id: packId, userId } });
    if (!p) throw new DomainError("NOT_FOUND", "Booster pack not found.");
    if (p.kind) return p.kind as BoosterKind;
    throw new DomainError("EXPIRED", "This booster pack has expired.");
  }
  return kind;
}

/** Packs to open and opened boosters still available (or played on an entry) for the Packs page and squad builder. */
export async function myBoosters(userId: string, now = new Date()) {
  const rows = await db.boosterPack.findMany({ where: { userId, expiresAt: { gt: now } }, orderBy: { grantedAt: "desc" } });
  return rows.map((b) => ({ id: b.id, kind: (b.kind as BoosterKind | null) ?? null, expiresAt: b.expiresAt, usedEntryId: b.usedEntryId, opened: !!b.openedAt }));
}

/**
 * Inside an entry save: play the chosen booster on this entry (or none). A booster already on the
 * entry is released if it's changed. A booster can only be on one entry.
 */
/**
 * Put a booster on one player of a saved entry (or take it off). `boostedOn` is the card id, or
 * the player id in a free draft. Super Sub must go on a sub; the others on anyone in the squad.
 * Runs after the entry's selections have been written, in the same transaction.
 */
export async function attachBooster(tx: Tx, userId: string, entryId: string, boosterId: string | null | undefined, boostedOn?: string | null) {
  const current = await tx.boosterPack.findUnique({ where: { usedEntryId: entryId } });
  if (current && current.id !== boosterId) await tx.boosterPack.update({ where: { id: current.id }, data: { usedEntryId: null, usedAt: null } });
  await tx.competitionSelection.updateMany({ where: { entryId, isBoosted: true }, data: { isBoosted: false } });
  if (!boosterId) {
    await tx.competitionEntry.update({ where: { id: entryId }, data: { boosterKind: null } });
    return null;
  }
  const b = await tx.boosterPack.findFirst({ where: { id: boosterId, userId } });
  if (!b || !b.kind) throw new DomainError("NO_BOOSTER", "Open your booster pack first.");
  if (b.expiresAt <= new Date()) throw new DomainError("EXPIRED", "That booster has expired.");
  if (b.usedEntryId && b.usedEntryId !== entryId) throw new DomainError("BOOSTER_USED", "That booster is already on another match entry.");
  const kind = b.kind as BoosterKind;
  if (!boostedOn) throw new DomainError("NO_PLAYER", `Pick the player to put ${BOOSTERS[kind].name} on.`);
  const target = await tx.competitionSelection.findFirst({ where: { entryId, OR: [{ cardId: boostedOn }, { cardId: null, playerId: boostedOn }] } });
  if (!target) throw new DomainError("NO_PLAYER", "Your booster must go on a player in this squad.");
  if (BOOSTERS[kind].benchOnly && target.slot !== "BENCH") throw new DomainError("BENCH_ONLY", `${BOOSTERS[kind].name} goes on one of your subs.`);
  if (!BOOSTERS[kind].benchOnly && target.slot !== "STARTER") throw new DomainError("STARTERS_ONLY", `${BOOSTERS[kind].name} goes on one of your starting seven.`);
  await tx.competitionSelection.update({ where: { id: target.id }, data: { isBoosted: true } });
  await tx.boosterPack.update({ where: { id: b.id }, data: { usedEntryId: entryId, usedAt: new Date() } });
  await tx.competitionEntry.update({ where: { id: entryId }, data: { boosterKind: kind } });
  return kind;
}

/** Withdrawing an entry gives its booster back. */
export async function releaseBooster(tx: Tx, entryId: string) {
  await tx.boosterPack.updateMany({ where: { usedEntryId: entryId }, data: { usedEntryId: null, usedAt: null } });
}
