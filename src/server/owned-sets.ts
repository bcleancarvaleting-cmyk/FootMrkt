import { db, withTx } from "./db";
import { DomainError, isUniqueViolation } from "./errors";
import { notify } from "./notifications";
import { credit } from "./wallet";

/**
 * Keep-and-collect sets (product decision 11 Nov 2026). Unlike binders, nothing is handed in: own a
 * card of every player in the set at the same time, claim a one-off earned-MX reward and a badge,
 * and keep the cards. Sets are worked out from the live squads, so they follow transfers.
 *
 *  - Full squad:   every player at a club (e.g. all 36 Gillingham players), any tier or copy.
 *  - Club Golds:   every Gold player at a club (clubs with 2+ Golds).
 *  - League Stars: the most valuable player at every club in a league.
 */
export const OWNED_SET_REWARD = { squad: 2000, golds: 1000, stars: 2500 } as const; // 20 / 10 / 25 MX
type Kind = keyof typeof OWNED_SET_REWARD;

export interface OwnedSet {
  code: string;
  kind: Kind;
  name: string;
  description: string;
  rewardMinor: number;
  playerIds: string[];
}

/** Every set, from the current squads. */
export async function allOwnedSets(): Promise<OwnedSet[]> {
  const players = await db.player.findMany({
    where: { active: true, clubId: { not: null }, templates: { some: { edition: "STANDARD", active: true } } },
    select: { id: true, marketValueGbp: true, clubId: true, templates: { where: { edition: "STANDARD", active: true }, select: { category: true }, take: 1 } },
  });
  const clubs = await db.club.findMany({ select: { id: true, code: true, name: true, league: { select: { code: true, name: true } } }, orderBy: { name: "asc" } });
  const byClub = new Map<string, typeof players>();
  for (const p of players) byClub.set(p.clubId!, [...(byClub.get(p.clubId!) ?? []), p]);
  const sets: OwnedSet[] = [];
  const stars = new Map<string, { name: string; ids: string[] }>();
  for (const c of clubs) {
    const squad = byClub.get(c.id) ?? [];
    if (squad.length < 5) continue;
    sets.push({ code: `squad:${c.code}`, kind: "squad", name: `${c.name} full squad`, description: `A card of all ${squad.length} ${c.name} players.`, rewardMinor: OWNED_SET_REWARD.squad, playerIds: squad.map((p) => p.id) });
    const golds = squad.filter((p) => p.templates[0]?.category === "GOLD");
    if (golds.length >= 2) sets.push({ code: `golds:${c.code}`, kind: "golds", name: `${c.name} Golds`, description: `All ${golds.length} ${c.name} Gold players.`, rewardMinor: OWNED_SET_REWARD.golds, playerIds: golds.map((p) => p.id) });
    const best = [...squad].sort((a, b) => (b.marketValueGbp ?? 0) - (a.marketValueGbp ?? 0))[0];
    const l = stars.get(c.league.code) ?? { name: c.league.name, ids: [] };
    l.ids.push(best.id);
    stars.set(c.league.code, l);
  }
  for (const [code, l] of stars) {
    sets.push({ code: `stars:${code}`, kind: "stars", name: `${l.name} Stars`, description: `The most valuable player at all ${l.ids.length} ${l.name} clubs.`, rewardMinor: OWNED_SET_REWARD.stars, playerIds: l.ids });
  }
  return sets;
}

/** Players this manager owns a usable card of (loans don't count; listed or in-a-match cards do). */
async function ownedPlayers(userId: string) {
  const rows = await db.cardInstance.findMany({ where: { ownerId: userId, supplyState: "HELD", loanGameweeks: null }, select: { template: { select: { playerId: true } } } });
  return new Set(rows.map((r) => r.template.playerId));
}

/** Progress on every set the manager has started, closest to done first. */
export async function ownedSetProgress(userId: string) {
  const [sets, owned, claims] = await Promise.all([allOwnedSets(), ownedPlayers(userId), db.ownedSetClaim.findMany({ where: { userId } })]);
  const claimed = new Set(claims.map((c) => c.code));
  return sets
    .map((s) => {
      const have = s.playerIds.filter((id) => owned.has(id)).length;
      return { ...s, have, total: s.playerIds.length, complete: have === s.playerIds.length, claimed: claimed.has(s.code), missing: s.playerIds.filter((id) => !owned.has(id)) };
    })
    .filter((s) => s.have > 0 || s.kind === "stars")
    .sort((a, b) => Number(a.claimed) - Number(b.claimed) || b.have / b.total - a.have / a.total || a.total - b.total);
}

export async function claimOwnedSet(userId: string, code: string) {
  const set = (await allOwnedSets()).find((s) => s.code === code);
  if (!set) throw new DomainError("NOT_FOUND", "That set doesn't exist.");
  const owned = await ownedPlayers(userId);
  const missing = set.playerIds.filter((id) => !owned.has(id)).length;
  if (missing) throw new DomainError("INCOMPLETE", `You still need ${missing} more player${missing === 1 ? "" : "s"} for this set.`);
  try {
    const claim = await withTx(async (tx) => {
      const c = await tx.ownedSetClaim.create({ data: { userId, code, name: set.name, rewardMinor: set.rewardMinor } });
      await credit(tx, { userId, amountMinor: set.rewardMinor, kind: "SET_REWARD", bucket: "BONUS", refId: `owned-set:${code}:${userId}`, note: `Set complete: ${set.name}` });
      return c;
    });
    await notify(userId, { kind: "SET_COMPLETE", title: `Set complete: ${set.name}`, body: `+${(set.rewardMinor / 100).toFixed(0)} MX and a badge on your club page. You keep every card.`, href: "/collections" }).catch(() => {});
    return claim;
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("ALREADY_CLAIMED", "You've already claimed this set.");
    throw e;
  }
}

/** Badges for a club page. */
export const setBadges = (userId: string) => db.ownedSetClaim.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
