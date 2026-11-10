import { FINISHES, type FinishKind } from "@/config/tiers";
import type { RandomSource } from "@/domain/random";
import type { Tx } from "./db";
import { getSetting } from "./settings";

/**
 * Special finishes (cosmetic only). Any Gold that comes out of a pack — or is signed from a MATCHX
 * player drop — is rolled for a Diamond (1 in N), then a Ruby (1 in M), while that player still
 * has some of their 5 Diamonds / 10 Rubies left.
 */
export async function finishOdds(): Promise<Record<FinishKind, number>> {
  const [DIAMOND, RUBY] = await Promise.all([getSetting("diamondOneIn"), getSetting("rubyOneIn")]);
  return { DIAMOND, RUBY };
}

/** Roll for a finish (rarest first) and, on a hit, give the card the next serial. */
export async function rollFinish(tx: Tx, rng: RandomSource, odds: Record<FinishKind, number>, card: { playerId: string; cardId: string }) {
  for (const kind of ["DIAMOND", "RUBY"] as const) {
    if (rng.int(odds[kind]) !== 0) continue;
    const serial = await claimFinish(tx, kind, card.playerId, card.cardId);
    if (serial) return { kind, serial };
  }
  return null;
}

/**
 * Give this card the next serial of that finish for its player, if any are left. Returns the serial,
 * or null when they're all out (or another opening took the last one at the same moment).
 */
export async function claimFinish(tx: Tx, kind: FinishKind, playerId: string, cardId: string): Promise<number | null> {
  const taken = await tx.cardFinish.count({ where: { playerId, kind } });
  if (taken >= FINISHES[kind].perPlayer) return null;
  const made = await tx.cardFinish.createMany({ data: [{ kind, playerId, cardId, serial: taken + 1 }], skipDuplicates: true });
  return made.count === 1 ? taken + 1 : null;
}
