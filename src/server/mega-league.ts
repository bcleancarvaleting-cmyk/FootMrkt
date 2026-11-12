import { toCrest } from "@/lib/crest";
import { db } from "./db";

/**
 * The Mega League: every manager's season total — their best score in each gameweek, added up
 * (so entering more matches doesn't inflate it). The current gameweek counts live, from
 * provisional points, and settles when the gameweek does.
 */
export async function megaLeague(userId: string | null, take = 100) {
  const latest = await db.gameweek.findFirst({ where: { status: { in: ["PROVISIONAL", "SETTLED"] } }, orderBy: [{ season: "desc" }, { number: "desc" }] });
  if (!latest) return { season: null, gameweek: null, live: false, rows: [], me: null, managers: 0 };
  const rows = await db.$queryRaw<Array<{ userId: string; total: number; played: bigint; best: number; gw: number | null }>>`
    WITH best AS (
      SELECT e."userId", g.number, MAX(COALESCE(e."finalPoints", e."provisionalPoints", 0)) AS pts
      FROM "CompetitionEntry" e
      JOIN "Competition" c ON c.id = e."competitionId"
      JOIN "Gameweek" g ON g.id = c."gameweekId"
      WHERE e.status = 'ACTIVE' AND c.status IN ('PROVISIONAL', 'SETTLED') AND g.season = ${latest.season}
      GROUP BY e."userId", g.number
    )
    SELECT best."userId", SUM(pts)::float AS total, COUNT(*) AS played, MAX(pts)::float AS best,
           SUM(CASE WHEN number = ${latest.number} THEN pts END)::float AS gw
    FROM best JOIN "User" u ON u.id = best."userId" AND u.status = 'ACTIVE'
    GROUP BY best."userId"
    ORDER BY total DESC, best."userId"`;
  const managers = rows.length;
  const ranked: Array<(typeof rows)[number] & { rank: number }> = [];
  rows.forEach((r, i) => ranked.push({ ...r, rank: i > 0 && r.total === rows[i - 1].total ? ranked[i - 1].rank : i + 1 }));
  const shown = ranked.slice(0, take);
  const mine = userId ? ranked.find((r) => r.userId === userId) ?? null : null;
  const ids = [...new Set([...shown.map((r) => r.userId), ...(mine ? [mine.userId] : [])])];
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, clubName: true, crest: true, foundingNumber: true } });
  const view = (r: (typeof ranked)[number]) => {
    const u = users.find((x) => x.id === r.userId);
    return {
      userId: r.userId,
      rank: r.rank,
      name: u?.displayName ?? "Manager",
      clubName: u?.clubName ?? null,
      crest: toCrest(u?.crest),
      foundingNumber: u?.foundingNumber ?? null,
      total: Math.round(r.total * 10) / 10,
      gw: r.gw == null ? null : Math.round(r.gw * 10) / 10,
      played: Number(r.played),
      best: Math.round(r.best * 10) / 10,
    };
  };
  return { season: latest.season, gameweek: latest.number, live: latest.status === "PROVISIONAL", rows: shown.map(view), me: mine ? view(mine) : null, managers };
}
