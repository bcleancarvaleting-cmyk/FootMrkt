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
 * `loanGameweeks` different gameweeks. Once that many have been settled the loan has ended: the
 * card stays in the club, flashing "Discard loan player", until the manager discards it.
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

export interface LoanStatus {
  /** Gameweeks the loan can still be picked in (0 = used up). */
  left: number;
  /** Every counted gameweek has been settled: the loan is over and the card can be discarded. */
  ended: boolean;
}

/** Loan status for each loan card. Cards that aren't loans are left out. */
export async function loansLeft(cards: Array<{ id: string; ownerId: string | null; mintedAt: Date; loanGameweeks: number | null }>, client: Client = db) {
  const out = new Map<string, LoanStatus>();
  const loans = cards.filter((c) => c.loanGameweeks !== null && c.loanGameweeks !== undefined && c.ownerId);
  const cache = new Map<string, Awaited<ReturnType<typeof enteredGameweeks>>>();
  for (const c of loans) {
    const k = `${c.ownerId}:${c.mintedAt.toISOString()}`;
    if (!cache.has(k)) cache.set(k, await enteredGameweeks(client, c.ownerId!, c.mintedAt));
    const used = cache.get(k)!;
    out.set(c.id, { left: Math.max(0, c.loanGameweeks! - used.all.size), ended: used.settled >= c.loanGameweeks! });
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

/** The manager discards a loan player whose loan has ended: the card leaves the club for good. */
export async function discardLoan(userId: string, cardId: string) {
  const card = await db.cardInstance.findUnique({ where: { id: cardId }, select: { id: true, ownerId: true, supplyState: true, lock: true, mintedAt: true, loanGameweeks: true } });
  if (!card || card.ownerId !== userId || card.supplyState !== "HELD" || card.loanGameweeks === null) throw new DomainError("NOT_FOUND", "Loan player not found.");
  const status = (await loansLeft([card])).get(card.id)!;
  if (!status.ended) throw new DomainError("LOAN_ACTIVE", "This loan hasn't finished yet — keep playing them!");
  if (card.lock !== "NONE") throw new DomainError("LOCKED", "This player is still in a squad.");
  const now = new Date();
  await db.$transaction([
    db.cardInstance.updateMany({ where: { id: card.id, ownerId: userId, supplyState: "HELD", lock: "NONE" }, data: { supplyState: "RETIRED", ownerId: null } }),
    db.cardOwnership.updateMany({ where: { cardId: card.id, releasedAt: null }, data: { releasedAt: now, releasedVia: "ADMIN", releasedRef: "loan-ended" } }),
    db.favouriteCard.deleteMany({ where: { cardId: card.id } }),
  ]);
}

/** Ended loans still in the manager's club, for the "discard" prompts. */
export async function endedLoans(userId: string) {
  const cards = await db.cardInstance.findMany({ where: { ownerId: userId, supplyState: "HELD", loanGameweeks: { not: null } }, select: { id: true, ownerId: true, mintedAt: true, loanGameweeks: true } });
  const status = await loansLeft(cards);
  return cards.filter((c) => status.get(c.id)?.ended).map((c) => c.id);
}

export const isLoanWhere: Prisma.CardInstanceWhereInput = { loanGameweeks: { not: null } };
