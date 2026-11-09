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
  return {
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
