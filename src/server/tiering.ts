import type { CardCategory } from "@/generated/prisma/client";
import { MAX_SUPPLY, tierForValue } from "@/config/tiers";
import { audit } from "./audit";
import { type Tx, db, withTx } from "./db";

/**
 * Move a player to a new tier — and every card of them with it (product decision 10 Nov 2026).
 * Cards are never tied to a season: a Bronze bought today becomes a Gold if the player's value
 * rises past the Gold line, and drops back if it falls. That's the reason to hold (and buy) young
 * players early.
 *
 * Each edition's template simply changes category, so every card keeps its serial number. If an
 * older template already exists for the new tier (the player has been there before), cards are
 * merged into it and numbered on after its existing cards. The supply cap becomes the new tier's
 * cap, but never below what's already issued — upgraded players don't get extra copies printed.
 */
export async function retierPlayer(tx: Tx, playerId: string, category: CardCategory) {
  const templates = await tx.cardTemplate.findMany({ where: { playerId }, orderBy: { createdAt: "asc" } });
  const standard = templates.filter((t) => t.edition === "STANDARD");
  const active = standard.find((t) => t.active) ?? standard[0];
  if (!active) {
    await tx.cardTemplate.create({ data: { playerId, category, edition: "STANDARD", maxSupply: MAX_SUPPLY[category] } });
    return { changed: true, from: [] as CardCategory[], to: category };
  }
  if (active.category === category && standard.filter((t) => t.active).length === 1) return { changed: false };
  const from = [active.category];

  for (const edition of [...new Set(templates.map((t) => t.edition))]) {
    const mine = templates.filter((t) => t.edition === edition);
    let target = mine.find((t) => t.category === category) ?? null;
    for (const src of mine.filter((t) => t.category !== category)) {
      if (!target) {
        // Move in place: same template, new tier.
        target = await tx.cardTemplate.update({ where: { id: src.id }, data: { category } });
        continue;
      }
      // Merge into the existing template for that tier, numbering on.
      const top = (await tx.cardInstance.aggregate({ where: { templateId: target.id }, _max: { serial: true } }))._max.serial ?? 0;
      const cards = await tx.cardInstance.findMany({ where: { templateId: src.id }, orderBy: { serial: "asc" }, select: { id: true } });
      for (const [i, c] of cards.entries()) await tx.cardInstance.update({ where: { id: c.id }, data: { templateId: target.id, serial: top + i + 1 } });
      const sets = await tx.collectionRequirement.findMany({ where: { templateId: src.id } });
      for (const r of sets) {
        const clash = await tx.collectionRequirement.findFirst({ where: { setId: r.setId, templateId: target.id } });
        if (clash) await tx.collectionRequirement.delete({ where: { id: r.id } });
        else await tx.collectionRequirement.update({ where: { id: r.id }, data: { templateId: target.id } });
      }
      await tx.cardTemplate.update({ where: { id: src.id }, data: { active: false } });
    }
    if (target && edition === "STANDARD") {
      const issued = await tx.cardInstance.count({ where: { templateId: target.id, supplyState: { not: "RETIRED" } } });
      await tx.cardTemplate.update({ where: { id: target.id }, data: { active: true, maxSupply: Math.max(issued, MAX_SUPPLY[category]) } });
      await tx.cardTemplate.updateMany({ where: { playerId, edition: "STANDARD", id: { not: target.id } }, data: { active: false } });
    }
  }
  return { changed: true, from, to: category };
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
  const changedTo: Array<[string, string]> = [];
  for (const r of rows) {
    await withTx(async (tx) => {
      await tx.player.update({ where: { id: r.playerId }, data: { marketValueGbp: r.valueGbp, marketValueSource: r.source, marketValueAt: r.at } });
      const res = await retierPlayer(tx, r.playerId, tierForValue(r.valueGbp));
      if (res.changed) {
        retiered++;
        changedTo.push([r.playerId, res.to as string]);
        await audit(tx, { actorId, action: "player.retier", entityType: "Player", entityId: r.playerId, before: { tiers: res.from }, after: { tier: res.to, valueGbp: r.valueGbp, source: r.source } });
      }
    });
  }
  // Tell watchers about tier changes once the values are saved.
  const { alertTierChange } = await import("./watchlist");
  for (const [playerId, to] of changedTo) await alertTierChange(playerId, to);
  return { updated: rows.length, retiered };
}

export async function activeTier(playerId: string) {
  return (await db.cardTemplate.findFirst({ where: { playerId, edition: "STANDARD", active: true } }))?.category ?? null;
}
