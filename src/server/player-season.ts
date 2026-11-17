import { CURRENT_SCORING_RULES, getScoringRules, scorePlayer, toStatLine } from "@/domain/football/scoring";
import { db } from "./db";
import { currentSeason } from "./season";

/**
 * A player's season at a glance (real matches only): what has scored them points, their totals, their
 * club's last five competitive results with the minutes they played in each, and the next game.
 */
export async function playerSeason(playerId: string, now = new Date()) {
  const player = await db.player.findUnique({ where: { id: playerId }, select: { id: true, position: true, clubId: true, sidelinedKind: true, sidelinedReason: true, sidelinedUntil: true, club: { select: { code: true, name: true } } } });
  if (!player) return null;
  const season = await currentSeason();
  const stats = await db.playerMatchStat.findMany({
    where: { playerId, isCurrent: true, fixture: { gameweek: { season, simulated: false } } },
    select: { stats: true, fixtureId: true },
  });
  const lines = stats.map((s) => ({ fixtureId: s.fixtureId, line: toStatLine(s.stats) }));
  const played = lines.filter((l) => l.line.minutes > 0);
  const rules = getScoringRules(CURRENT_SCORING_RULES);
  const scored = scorePlayer(rules, player.position as never, played.map((l) => l.line));
  const sum = (k: "goals" | "assists" | "minutes" | "saves" | "yellowCards" | "redCards") => played.reduce((t, l) => t + (l.line[k] ?? 0), 0);
  const cleanSheets = played.filter((l) => l.line.minutes >= 60 && (l.line.goalsConceded ?? 0) === 0).length;

  const minutesIn = new Map(lines.map((l) => [l.fixtureId, l.line.minutes]));
  const form = player.clubId
    ? (
        await db.fixture.findMany({
          where: { status: "FINISHED", gameweek: { simulated: false }, OR: [{ homeClubId: player.clubId }, { awayClubId: player.clubId }] },
          orderBy: { kickoffAt: "desc" },
          take: 5,
          select: { id: true, kickoffAt: true, homeClubId: true, homeGoals: true, awayGoals: true, homeClub: { select: { code: true } }, awayClub: { select: { code: true } } },
        })
      ).map((f) => {
        const home = f.homeClubId === player.clubId;
        const us = (home ? f.homeGoals : f.awayGoals) ?? 0;
        const them = (home ? f.awayGoals : f.homeGoals) ?? 0;
        return {
          id: f.id,
          result: us > them ? ("W" as const) : us < them ? ("L" as const) : ("D" as const),
          score: `${us}–${them}`,
          opponent: home ? f.awayClub.code : f.homeClub.code,
          home,
          minutes: minutesIn.get(f.id) ?? 0,
          date: f.kickoffAt,
        };
      })
    : [];
  const next = player.clubId
    ? await db.fixture.findFirst({
        where: { status: "SCHEDULED", kickoffAt: { gt: now }, gameweek: { simulated: false }, OR: [{ homeClubId: player.clubId }, { awayClubId: player.clubId }] },
        orderBy: { kickoffAt: "asc" },
        select: { kickoffAt: true, homeClubId: true, homeClub: { select: { code: true, name: true } }, awayClub: { select: { code: true, name: true } } },
      })
    : null;
  return {
    season,
    out: player.sidelinedKind ? { kind: player.sidelinedKind, reason: player.sidelinedReason, until: player.sidelinedUntil } : null,
    apps: played.length,
    minutes: sum("minutes"),
    goals: sum("goals"),
    assists: sum("assists"),
    cleanSheets,
    saves: sum("saves"),
    yellow: sum("yellowCards"),
    red: sum("redCards"),
    points: Math.round(scored.points * 10) / 10,
    perGame: played.length ? Math.round((scored.points / played.length) * 10) / 10 : 0,
    breakdown: scored.items.sort((a, b) => b.points - a.points),
    form: form.reverse(), // oldest → newest
    next: next ? { at: next.kickoffAt, home: next.homeClubId === player.clubId, opponent: next.homeClubId === player.clubId ? next.awayClub : next.homeClub } : null,
  };
}
