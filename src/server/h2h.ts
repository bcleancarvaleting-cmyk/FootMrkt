import { db, withTx } from "./db";
import { DomainError, isUniqueViolation } from "./errors";
import { notify } from "./notifications";
import { creditXp } from "./wallet";

/**
 * Head-to-head challenges (product decision 11 Nov 2026). Challenge another manager for the
 * upcoming gameweek; once they accept, whoever has the higher best score across their matches that
 * gameweek wins. No stakes: the winner gets bonus XP and the result goes on both records.
 */
export const H2H_WIN_XP = 50;
const OPEN_PER_MANAGER = 10;

/** The gameweek challenges are for: the next one that hasn't locked. */
async function challengeGameweek() {
  const gw = await db.gameweek.findFirst({
    where: { status: { in: ["OPEN", "UPCOMING"] }, competitions: { some: { status: { in: ["OPEN", "UPCOMING"] } } } },
    orderBy: [{ season: "asc" }, { number: "asc" }],
    include: { competitions: { select: { locksAt: true } } },
  });
  if (!gw) return null;
  const deadline = new Date(Math.min(...gw.competitions.map((c) => c.locksAt.getTime())));
  return deadline > new Date() ? { ...gw, deadline } : null;
}

export async function challenge(challengerId: string, opponentName: string) {
  const opponent = await db.user.findFirst({ where: { displayName: { equals: opponentName.trim(), mode: "insensitive" }, status: "ACTIVE" }, select: { id: true, displayName: true } });
  if (!opponent) throw new DomainError("NOT_FOUND", "No manager with that name.");
  if (opponent.id === challengerId) throw new DomainError("SELF", "You can't challenge yourself.");
  const gw = await challengeGameweek();
  if (!gw) throw new DomainError("NO_GAMEWEEK", "There's no gameweek open for challenges right now.");
  const open = await db.h2HChallenge.count({ where: { challengerId, gameweekId: gw.id } });
  if (open >= OPEN_PER_MANAGER) throw new DomainError("LIMIT", `You can send ${OPEN_PER_MANAGER} challenges a gameweek.`);
  const reverse = await db.h2HChallenge.findUnique({ where: { gameweekId_challengerId_opponentId: { gameweekId: gw.id, challengerId: opponent.id, opponentId: challengerId } } });
  if (reverse) throw new DomainError("EXISTS", `${opponent.displayName} has already challenged you this gameweek — accept it on Head-to-head.`);
  const me = await db.user.findUniqueOrThrow({ where: { id: challengerId }, select: { displayName: true } });
  try {
    const c = await db.h2HChallenge.create({ data: { gameweekId: gw.id, challengerId, opponentId: opponent.id } });
    await notify(opponent.id, { kind: "H2H", title: `${me.displayName} challenged you`, body: `Head-to-head in GW${gw.number}: best score wins. Accept before the deadline.`, href: "/h2h", dedupeKey: `h2h:${c.id}:new` });
    return c;
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("EXISTS", `You've already challenged ${opponent.displayName} this gameweek.`);
    throw e;
  }
}

export async function respond(userId: string, challengeId: string, accept: boolean) {
  const c = await db.h2HChallenge.findUnique({ where: { id: challengeId } });
  if (!c || c.opponentId !== userId) throw new DomainError("NOT_FOUND", "Challenge not found.");
  if (c.status !== "PENDING") throw new DomainError("DONE", "You've already answered this challenge.");
  const gw = await challengeGameweek();
  if (!gw || gw.id !== c.gameweekId) throw new DomainError("LOCKED", "That gameweek has started — the challenge has expired.");
  await db.h2HChallenge.update({ where: { id: c.id }, data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date() } });
  const me = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });
  await notify(c.challengerId, { kind: "H2H", title: accept ? `${me.displayName} accepted your challenge` : `${me.displayName} declined your challenge`, body: accept ? "Game on. Best score this gameweek wins." : "Maybe next week.", href: "/h2h", dedupeKey: `h2h:${c.id}:reply` });
}

/** Scheduled: expire unanswered challenges once the gameweek locks; settle accepted ones once it settles. */
export async function settleH2H() {
  const out = { expired: 0, settled: 0 };
  const pending = await db.h2HChallenge.findMany({ where: { status: "PENDING" }, select: { id: true, gameweekId: true } });
  const current = await challengeGameweek();
  for (const p of pending) {
    if (current?.id === p.gameweekId) continue;
    await db.h2HChallenge.update({ where: { id: p.id }, data: { status: "EXPIRED" } });
    out.expired++;
  }
  const due = await db.h2HChallenge.findMany({ where: { status: "ACCEPTED", gameweekId: { in: (await db.gameweek.findMany({ where: { status: "SETTLED" }, select: { id: true } })).map((g) => g.id) } } });
  for (const c of due) {
    const best = async (userId: string) =>
      (await db.competitionEntry.aggregate({ where: { userId, competition: { gameweekId: c.gameweekId, status: "SETTLED" } }, _max: { finalPoints: true } }))._max.finalPoints ?? 0;
    const [a, b] = await Promise.all([best(c.challengerId), best(c.opponentId)]);
    const winnerId = a > b ? c.challengerId : b > a ? c.opponentId : null;
    await withTx(async (tx) => {
      const r = await tx.h2HChallenge.updateMany({ where: { id: c.id, status: "ACCEPTED" }, data: { status: "SETTLED", challengerPoints: a, opponentPoints: b, winnerId, settledAt: new Date() } });
      if (r.count && winnerId) await creditXp(tx, { userId: winnerId, xp: H2H_WIN_XP, refId: `h2h:${c.id}`, note: "Head-to-head win" });
    });
    for (const [me, mine, theirs] of [[c.challengerId, a, b], [c.opponentId, b, a]] as const) {
      const verdict = winnerId === null ? "Draw" : winnerId === me ? `You won (+${H2H_WIN_XP} XP)` : "You lost";
      await notify(me, { kind: "H2H", title: `Head-to-head: ${verdict}`, body: `${mine} pts v ${theirs} pts.`, href: "/h2h", dedupeKey: `h2h:${c.id}:result:${me}` });
    }
    out.settled++;
  }
  return out;
}

/** A manager's challenges and their win/draw/loss record. */
export async function myH2H(userId: string) {
  const rows = await db.h2HChallenge.findMany({ where: { OR: [{ challengerId: userId }, { opponentId: userId }] }, orderBy: { createdAt: "desc" }, take: 60 });
  const ids = [...new Set(rows.flatMap((r) => [r.challengerId, r.opponentId]))];
  const [users, gws] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, clubName: true } }),
    db.gameweek.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.gameweekId))] } }, select: { id: true, number: true } }),
  ]);
  const name = (id: string) => users.find((u) => u.id === id)?.displayName ?? "Manager";
  const list = rows.map((r) => {
    const mine = r.challengerId === userId;
    return {
      id: r.id,
      gameweek: gws.find((g) => g.id === r.gameweekId)?.number ?? 0,
      opponent: name(mine ? r.opponentId : r.challengerId),
      incoming: !mine,
      status: r.status,
      myPoints: mine ? r.challengerPoints : r.opponentPoints,
      theirPoints: mine ? r.opponentPoints : r.challengerPoints,
      result: r.status !== "SETTLED" ? null : r.winnerId === null ? "D" : r.winnerId === userId ? "W" : "L",
    };
  });
  const record = { W: list.filter((x) => x.result === "W").length, D: list.filter((x) => x.result === "D").length, L: list.filter((x) => x.result === "L").length };
  return { list, record };
}
