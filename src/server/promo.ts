import { db, type Tx } from "./db";
import { DomainError } from "./errors";

/**
 * Promo codes. MATCHX: 50% off three packs, for every manager. Claim it (type it or tap
 * "Use code") and your next three packs — paid by card or with your balance — are half price. The
 * offer keeps showing until all three are used; then it's gone for good.
 */
export const PROMOS = {
  MATCHX: { pct: 50, uses: 3, headline: "50% off 3 packs", detail: "Half price on three packs — paid by card or with your balance. Once per manager." },
} as const;
export type PromoCode = keyof typeof PROMOS;
export const WELCOME_PROMO: PromoCode = "MATCHX";

const normalise = (code: string) => code.trim().toUpperCase() as PromoCode;

export async function promoState(userId: string, code: PromoCode = WELCOME_PROMO) {
  const c = await db.promoClaim.findUnique({ where: { userId_code: { userId, code } } });
  const left = PROMOS[code].uses - (c?.uses ?? 0);
  return { code, ...PROMOS[code], left, status: !c ? ("none" as const) : c.usedAt || left <= 0 ? ("used" as const) : ("claimed" as const) };
}

/** Claim a code: it then comes off the next pack. */
export async function claimPromo(userId: string, raw: string) {
  const code = normalise(raw);
  if (!(code in PROMOS)) throw new DomainError("CODE", "That code isn't valid.");
  const existing = await db.promoClaim.findUnique({ where: { userId_code: { userId, code } } });
  if (existing?.usedAt) throw new DomainError("USED", `You've already used ${code}.`);
  if (!existing) await db.promoClaim.create({ data: { userId, code } }).catch(() => null);
  return { code, ...PROMOS[code] };
}

/** The price after an unused claimed code, and a way to mark it used in the same transaction. */
export async function applyPromo(tx: Tx, userId: string, priceMinor: number, ref: string) {
  const claim = await tx.promoClaim.findFirst({ where: { userId, usedAt: null } });
  if (!claim || !(claim.code in PROMOS)) return { priceMinor, code: null as PromoCode | null };
  const { pct, uses } = PROMOS[claim.code as PromoCode];
  const n = claim.uses + 1;
  const used = await tx.promoClaim.updateMany({ where: { id: claim.id, usedAt: null, uses: claim.uses }, data: { uses: n, usedRefs: { push: ref }, usedRef: ref, usedAt: n >= uses ? new Date() : null } });
  if (!used.count) return { priceMinor, code: null };
  return { priceMinor: Math.max(1, Math.round((priceMinor * (100 - pct)) / 100)), code: claim.code as PromoCode };
}

/** A card payment that failed or was refunded gives that use back. */
export async function releasePromo(tx: Tx, ref: string) {
  const claims = await tx.promoClaim.findMany({ where: { OR: [{ usedRefs: { has: ref } }, { usedRef: ref }] } });
  for (const c of claims) {
    await tx.promoClaim.update({
      where: { id: c.id },
      data: { uses: Math.max(0, c.uses - 1), usedRefs: c.usedRefs.filter((r) => r !== ref), usedRef: c.usedRef === ref ? null : c.usedRef, usedAt: null },
    });
  }
}

/** The price a manager would pay for a pack right now (for showing on the shop). */
export async function promoPrice(userId: string, priceMinor: number) {
  const claim = await db.promoClaim.findFirst({ where: { userId, usedAt: null } });
  if (!claim || !(claim.code in PROMOS)) return null;
  return Math.max(1, Math.round((priceMinor * (100 - PROMOS[claim.code as PromoCode].pct)) / 100));
}
