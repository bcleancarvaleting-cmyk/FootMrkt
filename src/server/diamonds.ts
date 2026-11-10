import { DIAMONDS_PER_PLAYER } from "@/config/tiers";
import type { RandomSource } from "@/domain/random";
import type { Tx } from "./db";
import { getSetting } from "./settings";

/**
 * Diamond finish (cosmetic only). Any Gold that comes out of a pack — or is signed from a MATCHX
 * player drop — has a 1-in-N chance (admin setting) of being a Diamond, while that player still
 * has some of their 5 left.
 */
export async function diamondOdds() {
  return getSetting("diamondOneIn");
}

/** Roll for a Diamond and, on a hit, give the card the next serial. Returns the serial or null. */
export async function rollDiamond(tx: Tx, rng: RandomSource, oneIn: number, card: { playerId: string; cardId: string }) {
  if (rng.int(oneIn) !== 0) return null;
  return claimDiamond(tx, card.playerId, card.cardId);
}

/**
 * Give this card the next Diamond serial for its player, if any are left. Returns the serial, or
 * null when all 5 are out (or another opening took the last one at the same moment).
 */
export async function claimDiamond(tx: Tx, playerId: string, cardId: string): Promise<number | null> {
  const taken = await tx.diamondCard.count({ where: { playerId } });
  if (taken >= DIAMONDS_PER_PLAYER) return null;
  const made = await tx.diamondCard.createMany({ data: [{ playerId, cardId, serial: taken + 1 }], skipDuplicates: true });
  return made.count === 1 ? taken + 1 : null;
}
