import { db } from "./db";
import { isEnabled } from "./flags";

/**
 * Launch rule (product decision 10 Nov 2026): until paid packs are switched on, every card handed
 * to a manager — packs, MATCHX listings, auctions — is permanently untradeable. Managers keep them
 * and can play, complete sets and hand them in for challenges, but can't sell them. Cards issued
 * once payments are live are tradeable as normal.
 */
export async function cardsTradeableNow() {
  return isEnabled("PAID_PACKS");
}

/** One-off: make every card managers currently hold untradeable (run before payments go live). */
export async function lockAllHeldCards() {
  const r = await db.cardInstance.updateMany({ where: { supplyState: "HELD", tradeStatus: "TRADEABLE", lock: "NONE" }, data: { tradeStatus: "NON_TRADEABLE" } });
  return r.count;
}
