import { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "./db";
import { DomainError } from "./errors";

/**
 * Starter loan players (product decision 10 Nov 2026). Every new manager chooses two Gold players
 * from the top flight, on loan for the first gameweeks they enter. Loan cards are free, untradeable
 * and have no value: they can't be sold, listed, handed in for challenges or sets, and they leave
 * the club once the loan is used up.
 *
 * A gameweek counts towards the loan when the manager enters any match in it (whether or not the
 * loan players were picked), from the moment the loan was signed. The loan can be picked in up to
 * `loanGameweeks` different gameweeks; it is retired once that many have been settled.
 */
export const LOAN_GAMEWEEKS = 4;

type Client = Tx | typeof db;

/** Distinct gameweeks the manager has entered since `since`: all of them, and those already settled. */
async function enteredGameweeks(client: Client, userId: string, since: Date) {
  const rows = await client.$queryRaw<Array<{ gameweekId: string; settled: boolean }>>`
    SELECT c."gameweekId", bool_and(c.status = 'SETTLED') AS settled
    FROM "CompetitionEntry" e JOIN "Competition" c ON c.id = e."competitionId"
    WHERE e."userId" = ${userId}::uuid AND e.status = 'ACTIVE' AND e."createdAt" >= ${since} AND c.status <> 'CANCELLED'
    GROUP BY c."gameweekId"`;
  return { all: new Set(rows.map((r) => r.gameweekId)), settled: rows.filter((r) => r.settled).length };
}

/** Gameweeks left on each loan card (0 = used up). Cards that aren't loans are left out. */
export async function loansLeft(cards: Array<{ id: string; ownerId: string | null; mintedAt: Date; loanGameweeks: number | null }>, client: Client = db) {
  const out = new Map<string, number>();
  const loans = cards.filter((c) => c.loanGameweeks !== null && c.ownerId);
  const cache = new Map<string, Awaited<ReturnType<typeof enteredGameweeks>>>();
  for (const c of loans) {
    const k = `${c.ownerId}:${c.mintedAt.toISOString()}`;
    if (!cache.has(k)) cache.set(k, await enteredGameweeks(client, c.ownerId!, c.mintedAt));
    out.set(c.id, Math.max(0, c.loanGameweeks! - cache.get(k)!.all.size));
  }
  return out;
}

/**
 * Squad check: a loan card can go into a match in gameweek `gameweekId` only while the loan has
 * a gameweek left for it (re-entering or editing a gameweek already counted is always fine).
 */
export async function assertLoansUsable(tx: Tx, userId: string, gameweekId: string, cardIds: string[]) {
  if (!cardIds.length) return;
  const loans = await tx.cardInstance.findMany({ where: { id: { in: cardIds }, loanGameweeks: { not: null } }, select: { id: true, mintedAt: true, loanGameweeks: true, template: { select: { player: { select: { displayName: true } } } } } });
  for (const l of loans) {
    const { all } = await enteredGameweeks(tx, userId, l.mintedAt);
    const used = all.has(gameweekId) ? all.size : all.size + 1;
    if (used > l.loanGameweeks!) {
      throw new DomainError("LOAN_ENDED", `${l.template.player.displayName}'s loan has ended — loan players play for your first ${l.loanGameweeks} gameweeks.`);
    }
  }
}

/** Retire loan cards whose gameweeks have all been played and settled. Safe to run any time. */
export async function expireLoans(userIds?: string[]) {
  const loans = await db.cardInstance.findMany({
    where: { loanGameweeks: { not: null }, supplyState: "HELD", lock: "NONE", ownerId: userIds ? { in: userIds } : undefined },
    select: { id: true, ownerId: true, mintedAt: true, loanGameweeks: true },
  });
  let retired = 0;
  for (const l of loans) {
    const { settled } = await enteredGameweeks(db, l.ownerId!, l.mintedAt);
    if (settled < l.loanGameweeks!) continue;
    const now = new Date();
    await db.$transaction([
      db.cardInstance.updateMany({ where: { id: l.id, supplyState: "HELD", lock: "NONE" }, data: { supplyState: "RETIRED", ownerId: null } }),
      db.cardOwnership.updateMany({ where: { cardId: l.id, releasedAt: null }, data: { releasedAt: now, releasedVia: "ADMIN", releasedRef: "loan-ended" } }),
      db.favouriteCard.deleteMany({ where: { cardId: l.id } }),
    ]);
    retired++;
  }
  return retired;
}

export const isLoanWhere: Prisma.CardInstanceWhereInput = { loanGameweeks: { not: null } };
