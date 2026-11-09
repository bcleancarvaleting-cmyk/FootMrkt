import type { CardCategory } from "@/generated/prisma/client";
import { MAX_SUPPLY, tierForValue } from "@/config/tiers";
import { audit } from "./audit";
import { type Tx, db, withTx } from "./db";

/**
 * Move a player to a new tier for FUTURE supply. Cards already issued keep the tier they were
 * printed with (that's part of their collectible history); new weekly releases and pack draws
 * use only the active template.
 */
export async function retierPlayer(tx: Tx, playerId: string, category: CardCategory) {
  const current = await tx.cardTemplate.findMany({ where: { playerId, edition: "STANDARD" } });
  const active = current.filter((t) => t.active);
  if (active.length === 1 && active[0].category === category) return { changed: false };
  const target =
    current.find((t) => t.category === category) ??
    (await tx.cardTemplate.create({ data: { playerId, category, edition: "STANDARD", maxSupply: MAX_SUPPLY[category] } }));
  await tx.cardTemplate.updateMany({ where: { playerId, edition: "STANDARD", id: { not: target.id } }, data: { active: false } });
  if (!target.active) await tx.cardTemplate.update({ where: { id: target.id }, data: { active: true } });
  return { changed: true, from: active.map((t) => t.category), to: category };
}

export interface MarketValueRow {
  playerId: string;
  valueGbp: number;
  source: string;
  at: Date;
}

/** Store market values and re-tier each player. Audited per change. */
export async function applyMarketValues(rows: MarketValueRow[], actorId: string | null = null) {
  let retiered = 0;
  for (const r of rows) {
    await withTx(async (tx) => {
      await tx.player.update({ where: { id: r.playerId }, data: { marketValueGbp: r.valueGbp, marketValueSource: r.source, marketValueAt: r.at } });
      const res = await retierPlayer(tx, r.playerId, tierForValue(r.valueGbp));
      if (res.changed) {
        retiered++;
        await audit(tx, { actorId, action: "player.retier", entityType: "Player", entityId: r.playerId, before: { tiers: res.from }, after: { tier: res.to, valueGbp: r.valueGbp, source: r.source } });
      }
    });
  }
  return { updated: rows.length, retiered };
}

export async function activeTier(playerId: string) {
  return (await db.cardTemplate.findFirst({ where: { playerId, edition: "STANDARD", active: true } }))?.category ?? null;
}
