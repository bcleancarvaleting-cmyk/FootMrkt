import { FINISHES, type FinishKind } from "@/config/tiers";
import type { RandomSource } from "@/domain/random";
import type { Tx } from "./db";
import { getSetting } from "./settings";

/**
 * Special finishes (cosmetic only). Every card that comes out of a pack — or is signed from a MATCHX
 * player drop — is rolled, rarest first: the player's one-of-one Rainbow (any tier), then for Golds
 * a Diamond, then a Ruby, while that player still has some of that finish left.
 */
export async function finishOdds(): Promise<Record<FinishKind, number>> {
  const [RAINBOW, DIAMOND, RUBY] = await Promise.all([getSetting("rainbowOneIn"), getSetting("diamondOneIn"), getSetting("rubyOneIn")]);
  return { RAINBOW, DIAMOND, RUBY };
}

/** Roll for a finish (rarest first) and, on a hit, give the card the next serial. */
export async function rollFinish(tx: Tx, rng: RandomSource, odds: Record<FinishKind, number>, card: { playerId: string; cardId: string; category: string }) {
  for (const kind of ["RAINBOW", "DIAMOND", "RUBY"] as const) {
    if (!FINISHES[kind].anyTier && card.category !== "GOLD") continue;
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
