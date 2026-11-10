/**
 * Draft price: the player's current card value. Players not valued yet are estimated from their
 * real-world market value within their tier's usual range (Gold 10–23, Silver 3–7, Bronze 2).
 */
export function draftPrice(valueMp: number | null, category: string, marketValueGbp: number | null = null) {
  if (valueMp !== null) return Math.max(1, valueMp);
  const m = (marketValueGbp ?? 0) / 1_000_000;
  if (category === "GOLD") return 10 + Math.min(13, Math.round(m / 8));
  if (category === "SILVER") return 3 + Math.min(4, Math.round(m / 10));
  return 2;
}
