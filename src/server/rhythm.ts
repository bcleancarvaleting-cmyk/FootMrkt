import { db } from "./db";
import { notify } from "./notifications";

/**
 * The weekly rhythm, run by the 5-minute job. Every message is sent once (dedupe keys), to the
 * phone too if push is on:
 *  - 24 hours before the deadline: managers who've played recently but haven't entered yet.
 *  - 1 hour before: managers who have entered — check your captain; managers who played in the
 *    last fortnight but haven't entered this week — last call.
 *  - Results: once a gameweek settles, each entrant gets their best score and rank.
 */
const HOUR = 3600_000;

export async function weeklyRhythm(now = new Date()) {
  const out = { reminded24h: 0, reminded1h: 0, remindedMissing: 0, results: 0 };
  const open = await db.gameweek.findMany({ where: { status: { in: ["OPEN", "UPCOMING"] } }, include: { competitions: { where: { status: "OPEN" }, select: { id: true, locksAt: true } } } });
  for (const gw of open) {
    if (!gw.competitions.length) continue;
    const deadline = new Date(Math.min(...gw.competitions.map((c) => c.locksAt.getTime())));
    const left = deadline.getTime() - now.getTime();
    if (left <= 0) continue;
    const entered = new Set((await db.competitionEntry.findMany({ where: { competition: { gameweekId: gw.id }, status: "ACTIVE" }, select: { userId: true } })).map((e) => e.userId));
    const when = deadline.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    if (left <= 24 * HOUR && left > HOUR) {
      const recent = await db.user.findMany({ where: { status: "ACTIVE", lastSeenAt: { gte: new Date(now.getTime() - 21 * 24 * HOUR) } }, select: { id: true } });
      for (const u of recent.filter((x) => !entered.has(x.id))) {
        await notify(u.id, { kind: "DEADLINE", title: `GW${gw.number} deadline ${when}`, body: "Pick your seven before kick-off — the Freeroll and Free Draft are free to enter.", href: "/matches", dedupeKey: `gw:${gw.id}:24h:${u.id}` });
        out.reminded24h++;
      }
    }
    if (left <= HOUR) {
      for (const userId of entered) {
        await notify(userId, { kind: "DEADLINE", title: `GW${gw.number} locks in under an hour`, body: "Last chance to change your squad and captain.", href: "/matches", dedupeKey: `gw:${gw.id}:1h:${userId}` });
        out.reminded1h++;
      }
      // Managers who played in the last fortnight but haven't entered this week: one last nudge.
      const lapsing = await db.competitionEntry.findMany({
        where: { createdAt: { gte: new Date(now.getTime() - 14 * 24 * HOUR) }, user: { status: "ACTIVE" } },
        distinct: ["userId"],
        select: { userId: true },
      });
      for (const { userId } of lapsing.filter((x) => !entered.has(x.userId))) {
        await notify(userId, { kind: "DEADLINE", title: `GW${gw.number} locks in under an hour`, body: "You haven't picked a team this week — the Freeroll is free and takes a minute.", href: "/matches", dedupeKey: `gw:${gw.id}:1h-missing:${userId}` });
        out.remindedMissing++;
      }
    }
  }

  // Results for gameweeks that ended in the last week (each manager is told once).
  const settled = await db.gameweek.findMany({ where: { status: "SETTLED", endsAt: { gte: new Date(now.getTime() - 7 * 24 * HOUR) } }, select: { id: true, number: true } });
  for (const gw of settled) {
    const entries = await db.competitionEntry.findMany({
      where: { competition: { gameweekId: gw.id, status: "SETTLED" }, finalPoints: { not: null } },
      select: { userId: true, finalPoints: true, rank: true, competition: { select: { name: true, _count: { select: { entries: true } } } } },
    });
    const best = new Map<string, (typeof entries)[number]>();
    for (const e of entries) if (!best.has(e.userId) || (e.rank ?? 1e9) < (best.get(e.userId)!.rank ?? 1e9)) best.set(e.userId, e);
    for (const [userId, e] of best) {
      const top = e.rank === 1 ? "🏆 You won " : e.rank && e.rank <= 3 ? "🥈 Podium in " : "";
      await notify(userId, {
        kind: "RESULTS",
        title: `GW${gw.number} results: ${e.finalPoints} pts`,
        body: `${top}${e.competition.name} — #${e.rank} of ${e.competition._count.entries}. Your points are now XP. Tap to share your matchday.`,
        href: "/matchday",
        dedupeKey: `gw:${gw.id}:results:${userId}`,
      });
      out.results++;
    }
  }
  return out;
}

/** Last settled gameweek's match winners (for the "Gameweek winners" poster). */
export async function gameweekWinners() {
  const gw = await db.gameweek.findFirst({ where: { status: "SETTLED" }, orderBy: [{ season: "desc" }, { number: "desc" }] });
  if (!gw) return null;
  const wins = await db.competitionEntry.findMany({
    where: { rank: 1, competition: { gameweekId: gw.id } },
    select: { finalPoints: true, user: { select: { displayName: true, clubName: true } }, competition: { select: { name: true } } },
    orderBy: { finalPoints: "desc" },
  });
  return { number: gw.number, winners: wins.map((w) => ({ match: w.competition.name.replace(/ · GW\d+$/, ""), manager: w.user.displayName, club: w.user.clubName, points: w.finalPoints ?? 0 })) };
}
