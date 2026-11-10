import { db } from "./db";
import { CARD_INCLUDE, enrichCards } from "./views";

/** A pack opening as shown publicly on its share page (no private details: manager name and cards only). */
export async function publicOpening(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const o = await db.packOpening.findUnique({
    where: { id },
    include: { user: { select: { displayName: true } }, packSku: { select: { name: true, kind: true } }, cards: { orderBy: { slotIndex: "asc" }, include: { card: { include: CARD_INCLUDE } } } },
  });
  if (!o) return null;
  const cards = await enrichCards(o.cards.map((c) => c.card));
  return { id: o.id, manager: o.user.displayName, pack: o.packSku.name, starter: o.packSku.kind === "STARTER", cards: cards.map((c) => ({ ...c, acquired: null, pointsForYou: null })) };
}

export function packHeadline(cards: Array<{ category: string }>) {
  const g = cards.filter((c) => c.category === "GOLD").length;
  const s = cards.filter((c) => c.category === "SILVER").length;
  return g ? `${g} Gold${g > 1 ? "s" : ""}!` : s ? `${s} Silver` : `${cards.length} new players`;
}
