import { prizesPaid, prizesSummary } from "./competitions";
import { db } from "./db";
import { type WatchTeam, watchTeams } from "./watch";

/**
 * Results: every matchday that has been played — simulated or real — newest first, each with its
 * matches' winners. And one matchday's full results: per match the podium, the winning team(s) on
 * the pitch, and the final table with prizes.
 */
export async function resultsList(take = 30) {
  const gws = await db.gameweek.findMany({
    where: { OR: [{ status: "SETTLED" }, { status: "PROVISIONAL" }], competitions: { some: { entries: { some: {} } } } },
    orderBy: { startsAt: "desc" },
    take,
    select: {
      id: true,
      number: true,
      season: true,
      simulated: true,
      status: true,
      startsAt: true,
      competitions: {
        where: { status: { not: "CANCELLED" } },
        orderBy: [{ entryFeeMinor: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          status: true,
          rewards: true,
          _count: { select: { entries: true } },
          entries: { where: { status: "ACTIVE", rank: 1 }, take: 3, select: { finalPoints: true, user: { select: { displayName: true } } } },
        },
      },
    },
  });
  return gws.map((g) => ({
    id: g.id,
    title: g.simulated ? `SIM Matchday ${g.number}` : `Gameweek ${g.number}`,
    simulated: g.simulated,
    settled: g.status === "SETTLED",
    startsAt: g.startsAt,
    matches: g.competitions
      .filter((c) => c._count.entries > 0)
      .map((c) => ({
        id: c.id,
        name: c.name.replace(/ · (SIM|GW) ?\d+$/, ""),
        entries: c._count.entries,
        pot: prizesSummary(c.rewards).split(" · ")[0] || null,
        settled: c.status === "SETTLED",
        winners: c.entries.map((e) => e.user.displayName),
        points: c.entries[0]?.finalPoints ?? null,
      })),
  }));
}

export interface MatchResult {
  id: string;
  name: string;
  pot: string | null;
  settled: boolean;
  entries: number;
  winners: WatchTeam[];
  table: Array<{ entryId: string; rank: number; name: string; club: string | null; points: number; prizeMinor: number }>;
}

export async function matchdayResults(gameweekId: string) {
  const gw = await db.gameweek.findUnique({ where: { id: gameweekId }, select: { id: true, number: true, simulated: true, status: true, startsAt: true } });
  if (!gw) return null;
  const comps = await db.competition.findMany({
    where: { gameweekId, status: { not: "CANCELLED" } },
    orderBy: [{ entryFeeMinor: "asc" }, { name: "asc" }],
    select: { id: true, name: true, rewards: true, status: true },
  });
  const matches: MatchResult[] = [];
  for (const c of comps) {
    const settled = c.status === "SETTLED";
    const entries = await db.competitionEntry.findMany({
      where: { competitionId: c.id, status: "ACTIVE" },
      orderBy: settled ? [{ rank: "asc" }, { createdAt: "asc" }] : [{ provisionalPoints: { sort: "desc", nulls: "last" } }],
      select: { id: true, rank: true, finalPoints: true, provisionalPoints: true, user: { select: { displayName: true, clubName: true } } },
    });
    if (!entries.length) continue;
    const prizes = settled ? await prizesPaid(c.id) : new Map<string, number>();
    const byEntry = await db.competitionEntry.findMany({ where: { id: { in: entries.map((e) => e.id) } }, select: { id: true, userId: true } });
    const userOf = new Map(byEntry.map((e) => [e.id, e.userId]));
    let rank = 0;
    const table = entries.map((e, i) => {
      const pts = Math.round(((settled ? e.finalPoints : e.provisionalPoints) ?? 0) * 10) / 10;
      if (!settled && (i === 0 || pts !== Math.round((entries[i - 1].provisionalPoints ?? 0) * 10) / 10)) rank = i + 1;
      return { entryId: e.id, rank: settled ? (e.rank ?? i + 1) : rank, name: e.user.displayName, club: e.user.clubName, points: pts, prizeMinor: prizes.get(userOf.get(e.id) ?? "") ?? 0 };
    });
    const top = table.filter((r) => r.rank === table[0].rank).slice(0, 3);
    matches.push({ id: c.id, name: c.name.replace(/ · (SIM|GW) ?\d+$/, ""), pot: prizesSummary(c.rewards).split(" · ")[0] || null, settled, entries: table.length, winners: await watchTeams(top.map((r) => r.entryId)), table });
  }
  return { id: gw.id, title: gw.simulated ? `SIM Matchday ${gw.number}` : `Gameweek ${gw.number}`, simulated: gw.simulated, settled: gw.status === "SETTLED", startsAt: gw.startsAt, matches };
}
