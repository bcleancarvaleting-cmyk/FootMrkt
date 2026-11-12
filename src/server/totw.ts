import { cache } from "react";
import { db } from "./db";
import { notify } from "./notifications";
import { posterCards } from "./social";
import { performanceTable } from "./top-performers";

/**
 * Team of the Week. When a gameweek settles, its 7 best performers by MATCHX points are picked in
 * shape — 1 GK, 2 DEF, 2 MID, 2 ATT (the best players left fill a short position). Every copy of
 * their cards wears a TOTW badge for 7 days, then it comes off. Owners are told once.
 */
const DAY = 86_400_000;
const SHAPE = { GK: 1, DEF: 2, MID: 2, ATT: 2 } as const;
export const TOTW_DAYS = 7;

type Pick = { playerId: string; points: number; position: keyof typeof SHAPE };

/** Players wearing the badge right now (one query per request). */
export const totwPlayerIds = cache(async (now = new Date()) => {
  const rows = await db.teamOfTheWeek.findMany({ where: { expiresAt: { gt: now } }, select: { picks: true } }).catch(() => []);
  return new Set(rows.flatMap((r) => (r.picks as Pick[]).map((p) => p.playerId)));
});

export async function pickTeamOfTheWeek(now = new Date()) {
  const gws = await db.gameweek.findMany({
    where: { status: "SETTLED", simulated: false, endsAt: { gte: new Date(now.getTime() - TOTW_DAYS * DAY) } },
    orderBy: { endsAt: "asc" },
    select: { id: true, number: true, season: true },
  });
  const done = new Set((await db.teamOfTheWeek.findMany({ where: { gameweekId: { in: gws.map((g) => g.id) } }, select: { gameweekId: true } })).map((t) => t.gameweekId));
  const made: number[] = [];
  for (const gw of gws.filter((g) => !done.has(g.id))) {
    const rows = await performanceTable({ gameweekIds: [gw.id] });
    if (rows.length < 7) continue;
    const ranked = [...rows].sort((a, b) => b.points - a.points || b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name));
    const picks: Pick[] = [];
    for (const [pos, n] of Object.entries(SHAPE) as Array<[keyof typeof SHAPE, number]>) {
      picks.push(...ranked.filter((r) => r.position === pos).slice(0, n).map((r) => ({ playerId: r.playerId, points: r.points, position: pos })));
    }
    for (const r of ranked) if (picks.length < 7 && !picks.some((p) => p.playerId === r.playerId)) picks.push({ playerId: r.playerId, points: r.points, position: r.position as Pick["position"] });
    picks.sort((a, b) => b.points - a.points);
    const created = await db.teamOfTheWeek
      .create({ data: { gameweekId: gw.id, number: gw.number, season: gw.season, picks, expiresAt: new Date(now.getTime() + TOTW_DAYS * DAY) } })
      .catch(() => null); // another tick got there first
    if (!created) continue;
    made.push(gw.number);

    // Tell each owner once, naming their players in the team.
    const names = new Map(rows.map((r) => [r.playerId, r.name]));
    const owned = await db.cardInstance.findMany({
      where: { ownerId: { not: null }, supplyState: "HELD", template: { playerId: { in: picks.map((p) => p.playerId) } } },
      select: { ownerId: true, template: { select: { playerId: true } } },
    });
    const byOwner = new Map<string, Set<string>>();
    for (const c of owned) byOwner.set(c.ownerId!, (byOwner.get(c.ownerId!) ?? new Set()).add(c.template.playerId));
    for (const [userId, ids] of byOwner) {
      const list = [...ids].map((id) => names.get(id) ?? "Your player");
      await notify(userId, {
        kind: "TOTW",
        title: `⭐ ${list.length === 1 ? `${list[0]} is` : `${list.length} of your players are`} in the GW${gw.number} Team of the Week`,
        body: `${list.join(", ")} — their cards wear the TOTW badge for ${TOTW_DAYS} days.`,
        href: "/top-performers#totw",
        dedupeKey: `totw:${gw.id}:${userId}`,
      });
    }
  }
  return { picked: made };
}

/** The latest Team of the Week still wearing its badge, as cards, best first. */
export async function currentTeamOfTheWeek(now = new Date()) {
  const t = await db.teamOfTheWeek.findFirst({ where: { expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } });
  if (!t) return null;
  const picks = t.picks as Pick[];
  const cards = await posterCards(picks.map((p) => p.playerId));
  return {
    number: t.number,
    expiresAt: t.expiresAt,
    players: picks.flatMap((p) => {
      const card = cards.find((c) => c.playerId === p.playerId);
      return card ? [{ ...p, card: { ...card, totw: true } }] : [];
    }),
  };
}
