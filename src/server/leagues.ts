import { randomInt } from "node:crypto";
import { z } from "zod";
import { toCrest } from "@/lib/crest";
import { db } from "./db";
import { DomainError } from "./errors";

/**
 * Private mini-leagues: friends compete on their gameweek scores. A manager's score for a gameweek
 * is their best entry that gameweek (so entering several matches doesn't count twice); the table
 * adds up every gameweek of the current season.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
export const MAX_LEAGUES_PER_MANAGER = 20;
export const MAX_MEMBERS = 200;

export const LeagueNameSchema = z.string().trim().min(3, "League name must be 3–40 characters").max(40, "League name must be 3–40 characters");

const newCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export async function createLeague(userId: string, name: unknown) {
  const n = LeagueNameSchema.parse(name);
  if ((await db.miniLeagueMember.count({ where: { userId } })) >= MAX_LEAGUES_PER_MANAGER) throw new DomainError("LIMIT", `You can be in up to ${MAX_LEAGUES_PER_MANAGER} leagues.`);
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    if (await db.miniLeague.findUnique({ where: { code } })) continue;
    return db.miniLeague.create({ data: { name: n, code, ownerId: userId, members: { create: { userId } } } });
  }
  throw new DomainError("RETRY", "Couldn't make a league code — please try again.");
}

export async function leagueByCode(code: string) {
  return db.miniLeague.findUnique({ where: { code: code.trim().toUpperCase() }, include: { _count: { select: { members: true } } } });
}

export async function joinLeague(userId: string, code: string) {
  const league = await leagueByCode(code);
  if (!league) throw new DomainError("NOT_FOUND", "No league with that code — check it and try again.");
  if (league._count.members >= MAX_MEMBERS) throw new DomainError("FULL", "That league is full.");
  if ((await db.miniLeagueMember.count({ where: { userId } })) >= MAX_LEAGUES_PER_MANAGER) throw new DomainError("LIMIT", `You can be in up to ${MAX_LEAGUES_PER_MANAGER} leagues.`);
  await db.miniLeagueMember.createMany({ data: [{ leagueId: league.id, userId }], skipDuplicates: true });
  return league;
}

export async function leaveLeague(userId: string, leagueId: string) {
  const league = await db.miniLeague.findUnique({ where: { id: leagueId } });
  if (!league) throw new DomainError("NOT_FOUND", "League not found.");
  if (league.ownerId === userId) throw new DomainError("OWNER", "You created this league, so you can't leave it.");
  await db.miniLeagueMember.deleteMany({ where: { leagueId, userId } });
}

/** Each manager's score per gameweek: their best entry that gameweek (final, else provisional). */
async function gameweekScores(userIds: string[], season: string) {
  const entries = await db.competitionEntry.findMany({
    where: { userId: { in: userIds }, status: "ACTIVE", competition: { status: { in: ["PROVISIONAL", "SETTLED"] }, gameweek: { season } } },
    select: { userId: true, finalPoints: true, provisionalPoints: true, competition: { select: { gameweek: { select: { id: true, number: true } } } } },
  });
  const out = new Map<string, Map<number, number>>();
  for (const e of entries) {
    const pts = e.finalPoints ?? e.provisionalPoints ?? 0;
    const gw = e.competition.gameweek.number;
    const m = out.get(e.userId) ?? new Map<number, number>();
    m.set(gw, Math.max(m.get(gw) ?? -Infinity, pts));
    out.set(e.userId, m);
  }
  return out;
}

/** League table: everyone's season total and latest gameweek, best first. Members only. */
export async function leagueTable(userId: string, leagueId: string) {
  const league = await db.miniLeague.findUnique({
    where: { id: leagueId },
    include: { members: true },
  });
  if (!league || !league.members.some((m) => m.userId === userId)) throw new DomainError("NOT_FOUND", "League not found.");
  const latest = await db.gameweek.findFirst({ where: { status: { in: ["PROVISIONAL", "SETTLED"] } }, orderBy: [{ season: "desc" }, { number: "desc" }] });
  const users = await db.user.findMany({ where: { id: { in: league.members.map((m) => m.userId) } }, select: { id: true, displayName: true, clubName: true, crest: true, foundingNumber: true } });
  const scores = latest ? await gameweekScores(users.map((u) => u.id), latest.season) : new Map<string, Map<number, number>>();
  const rows = users
    .map((u) => {
      const s = scores.get(u.id) ?? new Map<number, number>();
      return {
        userId: u.id,
        name: u.displayName,
        clubName: u.clubName,
        crest: toCrest(u.crest),
        foundingNumber: u.foundingNumber,
        total: Math.round([...s.values()].reduce((a, b) => a + b, 0) * 10) / 10,
        gw: latest ? (s.get(latest.number) ?? null) : null,
        played: s.size,
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  let rank = 0;
  const ranked = rows.map((r, i) => {
    if (i === 0 || r.total !== rows[i - 1].total) rank = i + 1;
    return { ...r, rank };
  });
  return { league, rows: ranked, gameweek: latest?.number ?? null, season: latest?.season ?? null, live: latest?.status === "PROVISIONAL", isOwner: league.ownerId === userId };
}

/** Leagues a manager is in, with their current position. */
export async function myLeagues(userId: string) {
  const memberships = await db.miniLeagueMember.findMany({ where: { userId }, include: { league: { include: { _count: { select: { members: true } } } } }, orderBy: { joinedAt: "desc" } });
  return Promise.all(
    memberships.map(async (m) => {
      const t = await leagueTable(userId, m.leagueId);
      const me = t.rows.find((r) => r.userId === userId);
      return { id: m.league.id, name: m.league.name, code: m.league.code, members: m.league._count.members, rank: me?.rank ?? null, total: me?.total ?? 0 };
    }),
  );
}
