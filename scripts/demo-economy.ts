/**
 * DEV ONLY: fill the local database with a live free-pack drop, house auctions and P2P listings
 * so the Transfers / Packs pages can be previewed. Refuses to run in production.
 *   LEGAL_GATES_CLEARED=MARKET FLAG_MARKET=true npx tsx scripts/demo-economy.ts
 */
import "dotenv/config";
import { ensureDefaultChallenges } from "../src/server/challenges";
import { db, withTx } from "../src/server/db";
import { scheduleDrop, upcomingDrops } from "../src/server/drops";
import { grantPack, openPack, syncPackCatalogue } from "../src/server/packs";
import { createAuction, createListing, makeOffer } from "../src/server/transfers";
import { credit } from "../src/server/wallet";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("demo data is dev-only");
  console.log("pack versions published:", await syncPackCatalogue());
  await ensureDefaultChallenges();
  const admin = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  if (!(await upcomingDrops()).length) await scheduleDrop(admin.id, { title: "Matchday freebie", startsAt: new Date(Date.now() - 3 * 3_600_000), hours: 24 });

  const managers = await db.user.findMany({ where: { role: { not: "ADMIN" } } });
  for (const m of managers) {
    await withTx((tx) => credit(tx, { userId: m.id, amountMinor: 2500, kind: "DEPOSIT", bucket: "CASH", refId: `demo:cash:${m.id}` }));
    await withTx((tx) => credit(tx, { userId: m.id, amountMinor: 300, kind: "CHALLENGE_REWARD", refId: `demo:bonus:${m.id}`, note: "Clear the bench" }));
  }

  if (!(await db.auction.count({ where: { status: "LIVE" } }))) {
    const golds = await db.player.findMany({ where: { club: { league: { isTopFlight: true } }, templates: { some: { category: "GOLD", instances: { some: { supplyState: "AVAILABLE" } } } } }, orderBy: { marketValueGbp: { sort: "desc", nulls: "last" } }, take: 3 });
    for (const [i, p] of golds.entries()) {
      await createAuction(admin.id, { playerId: p.id, category: "GOLD", startPriceMinor: 500 + i * 250, minIncrementMinor: 25, startsAt: new Date(Date.now() - 60_000), hours: 6 + i * 20 });
    }
    const silver = await db.player.findFirst({ where: { templates: { some: { category: "SILVER", instances: { some: { supplyState: "AVAILABLE" } } } } } });
    if (silver) await createAuction(admin.id, { playerId: silver.id, category: "SILVER", startPriceMinor: 150, startsAt: new Date(Date.now() + 5 * 3_600_000), hours: 24 });
  }

  if (!(await db.marketListing.count({ where: { status: "ACTIVE" } }))) {
    for (const [i, m] of managers.entries()) {
      const sku = ["football-eng-gold", "football-eng-silver", "football-eng-bronze"][i % 3];
      const ent = await withTx((tx) => grantPack(tx, { userId: m.id, skuCode: sku, source: "DEV", sourceRef: `demo:list:${m.id}` }));
      const res = await openPack(m.id, ent.id);
      const cards = await db.cardInstance.findMany({ where: { id: { in: res.cards.map((c) => c.cardId) } }, include: { template: { include: { player: { include: { valuations: { orderBy: { computedAt: "desc" }, take: 1 } } } } } } });
      for (const c of cards.slice(0, 3)) {
        const v = c.template.player.valuations.find((x) => x.category === c.template.category)?.valueMp ?? 2;
        const price = Math.min(10_000, Math.max(20, Math.round(v * 100 * (0.9 + ((c.serial * 37) % 30) / 100))));
        await createListing(m.id, { cardId: c.id, askingPriceMinor: price, days: 3 + (c.serial % 5) });
      }
    }
    const listings = await db.marketListing.findMany({ where: { status: "ACTIVE" }, take: 6 });
    for (const [i, l] of listings.entries()) {
      const buyer = managers.find((m) => m.id !== l.sellerId && managers.indexOf(m) % 2 === i % 2);
      if (buyer && l.askingPriceMinor > 30) await makeOffer(buyer.id, l.id, Math.round(l.askingPriceMinor * 0.85)).catch(() => {});
    }
  }
  console.log("listings", await db.marketListing.count({ where: { status: "ACTIVE" } }), "auctions", await db.auction.count({ where: { status: { in: ["LIVE", "SCHEDULED"] } } }));
}

main().finally(() => db.$disconnect());
