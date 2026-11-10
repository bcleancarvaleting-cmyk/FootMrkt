import { FINISHES, type FinishKind } from "@/config/tiers";
import type { RandomSource } from "@/domain/random";
import type { Tx } from "./db";
import { getSetting } from "./settings";

/**
 * Special finishes (cosmetic only), rolled rarest first while the player still has some left:
 *  - Gold packs: every card can be its player's one-of-one Rainbow (any tier); Golds can also be a
 *    Diamond or a Ruby.
 *  - Player drops (Golds): Diamond or Ruby.
 *  - Rare packs: one slot is guaranteed a Ruby, Diamond or Rainbow (see guaranteedFinish).
 */
export async function finishOdds(): Promise<Record<FinishKind, number>> {
  const [RAINBOW, DIAMOND, RUBY] = await Promise.all([getSetting("rainbowOneIn"), getSetting("diamondOneIn"), getSetting("rubyOneIn")]);
  return { RAINBOW, DIAMOND, RUBY };
}

/** Roll for a finish (rarest first) and, on a hit, give the card the next serial. */
export async function rollFinish(
  tx: Tx,
  rng: RandomSource,
  odds: Record<FinishKind, number>,
  card: { playerId: string; cardId: string; category: string },
  kinds: readonly FinishKind[] = ["RAINBOW", "DIAMOND", "RUBY"],
) {
  for (const kind of kinds) {
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

/**
 * Rare packs: this card is guaranteed a finish. Pick one by the pack's weights; if that player has
 * none of it left, fall back to the other finishes (most plentiful first). Null only if the player
 * has run out of all three — the caller then refuses the opening so the pack isn't used.
 */
export async function guaranteedFinish(tx: Tx, rng: RandomSource, weights: Record<FinishKind, number>, card: { playerId: string; cardId: string }) {
  const roll = rng.int(10_000);
  let acc = 0;
  let first: FinishKind = "RUBY";
  for (const kind of ["RAINBOW", "DIAMOND", "RUBY"] as const) {
    acc += weights[kind];
    if (roll < acc) {
      first = kind;
      break;
    }
  }
  for (const kind of [first, ...(["RUBY", "DIAMOND", "RAINBOW"] as const).filter((k) => k !== first)]) {
    const serial = await claimFinish(tx, kind, card.playerId, card.cardId);
    if (serial) return { kind, serial };
  }
  return null;
}

/** Packs whose cards are rolled for finishes: Gold packs (and Rare packs). */
export const rollsFinishes = (skuCode: string) => /gold|rare/i.test(skuCode);
