import { db } from "./db";
import { currentGameweek } from "./gameweeks";

export const ONLINE_WINDOW_MIN = 15;

export interface LiveStats {
  onlineNow: number;
  managers: number;
  enteredThisGameweek: number;
  cardsInCirculation: number;
  packsOpenedToday: number;
  gameweek: { number: number; status: string; deadline: string | null; firstKickoff: string | null } | null;
  /** The next game(s) to lock — real or simulated — named as the admin titled them. */
  next: { label: string; deadline: string; sim: boolean; entered: number } | null;
  generatedAt: string;
}

/** Headline numbers for the live stats bar. Cheap aggregate queries; cached briefly by the API route. */
export async function liveStats(): Promise<LiveStats> {
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const gw = await currentGameweek();
  const [onlineNow, managers, cardsInCirculation, packsOpenedToday, entered, comp, first] = await Promise.all([
    db.user.count({ where: { lastSeenAt: { gte: new Date(now - ONLINE_WINDOW_MIN * 60_000) } } }),
    db.user.count({ where: { role: "USER" } }),
    db.cardInstance.count({ where: { supplyState: "HELD" } }),
    db.packOpening.count({ where: { createdAt: { gte: startOfDay } } }),
    gw ? db.competitionEntry.findMany({ where: { competition: { gameweekId: gw.id } }, distinct: ["userId"], select: { userId: true } }) : [],
    gw ? db.competition.findFirst({ where: { gameweekId: gw.id }, orderBy: { locksAt: "asc" } }) : null,
    gw ? db.fixture.findFirst({ where: { gameweekId: gw.id }, orderBy: { kickoffAt: "asc" } }) : null,
  ]);
  // Next game(s): the soonest open match deadline, plus any others locking at the same moment.
  const soon = await db.competition.findMany({
    where: { status: { in: ["OPEN", "UPCOMING"] }, locksAt: { gt: new Date(now) } },
    orderBy: [{ locksAt: "asc" }, { name: "asc" }],
    take: 20,
    select: { id: true, name: true, locksAt: true, gameweek: { select: { simulated: true, number: true } } },
  });
  const firstLock = soon[0]?.locksAt.getTime();
  const group = soon.filter((c) => c.locksAt.getTime() === firstLock);
  const nextEntered = group.length
    ? (await db.competitionEntry.findMany({ where: { status: "ACTIVE", competitionId: { in: group.map((c) => c.id) } }, distinct: ["userId"], select: { userId: true } })).length
    : 0;
  const next = group.length
    ? {
        label: group.length === 1 ? group[0].name : `${group[0].gameweek.simulated ? `SIM ${group[0].gameweek.number}` : `GW${group[0].gameweek.number}`} · ${group.length} games`,
        deadline: group[0].locksAt.toISOString(),
        sim: group[0].gameweek.simulated,
        entered: nextEntered,
      }
    : null;
  return {
    next,
    onlineNow,
    managers,
    enteredThisGameweek: entered.length,
    cardsInCirculation,
    packsOpenedToday,
    gameweek: gw
      ? { number: gw.number, status: gw.status, deadline: comp?.locksAt.toISOString() ?? null, firstKickoff: first?.kickoffAt.toISOString() ?? null }
      : null,
    generatedAt: new Date(now).toISOString(),
  };
}

/** Record activity, at most once every 2 minutes per user, for "online now". */
export async function touchUser(userId: string, lastSeenAt: Date | null) {
  if (lastSeenAt && Date.now() - lastSeenAt.getTime() < 120_000) return;
  await db.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
}
