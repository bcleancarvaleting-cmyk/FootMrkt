import { randomUUID } from "node:crypto";
import { audit } from "./audit";
import { db, withTx } from "./db";
import { DomainError } from "./errors";
import { footballSport } from "./gameweeks";
import { grantPack } from "./packs";
import { STARTER_PACK_CODE } from "@/config/packs";
import { executeRelease, scheduleRelease } from "./supply";
import { cancelAuction, clearHouseListings } from "./transfers";
import { lockWallet, release } from "./wallet";

/**
 * Free trial (product decision 10 Nov 2026): everyone who joins during the trial is a Founding
 * Member (numbered, badge kept forever). When the trial ends, admins wipe every team — cards,
 * packs, listings, offers, bids and MP — while accounts, founding badges, match history and £
 * winnings stay. Optionally everyone gets a fresh Starter Pack and a fresh card release is minted.
 */

/** Give every existing manager without a number a founding number, oldest account first. */
export async function backfillFoundingMembers(adminId: string) {
  return withTx(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242)`;
    const top = await tx.user.aggregate({ _max: { foundingNumber: true } });
    let n = top._max.foundingNumber ?? 0;
    const users = await tx.user.findMany({ where: { foundingNumber: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
    for (const u of users) await tx.user.update({ where: { id: u.id }, data: { foundingNumber: ++n } });
    await audit(tx, { actorId: adminId, action: "founding.backfill", entityType: "User", after: { added: users.length } });
    return users.length;
  });
}

export async function wipePreview() {
  const [users, held, unopened, listings, auctions, mp, inPlay] = await Promise.all([
    db.user.count(),
    db.cardInstance.count({ where: { supplyState: "HELD" } }),
    db.packEntitlement.count({ where: { status: "UNOPENED" } }),
    db.marketListing.count({ where: { status: "ACTIVE" } }),
    db.auction.count({ where: { status: { in: ["LIVE", "SCHEDULED"] } } }),
    db.walletEntry.aggregate({ where: { bucket: { in: ["CASH", "BONUS"] } }, _sum: { amountMinor: true } }),
    db.competition.count({ where: { status: { in: ["LOCKED", "PROVISIONAL"] } } }),
  ]);
  return { users, held, unopened, listings, auctions, mpMinor: mp._sum.amountMinor ?? 0, inPlay };
}

export async function wipeTeams(adminId: string, opts: { confirm: string; freshStarter: boolean; freshRelease: boolean }) {
  if (opts.confirm.trim().toUpperCase() !== "WIPE TEAMS") throw new DomainError("CONFIRM", "Type WIPE TEAMS to confirm.");
  const inPlay = await db.competition.count({ where: { status: { in: ["LOCKED", "PROVISIONAL"] } } });
  if (inPlay) throw new DomainError("IN_PLAY", `${inPlay} match(es) are locked or live — settle the gameweek first so prizes are paid.`);
  const wipeId = randomUUID();
  const now = new Date();

  // 1. Close the market: listings (offer holds are returned), house stock, auctions (bids returned).
  const peer = await db.marketListing.findMany({ where: { status: "ACTIVE", house: false }, select: { id: true, sellerId: true } });
  for (const l of peer) {
    await withTx(async (tx) => {
      const offers = await tx.marketOffer.findMany({ where: { listingId: l.id, status: "PENDING" } });
      for (const o of offers) {
        await lockWallet(tx, o.buyerId);
        await release(tx, { userId: o.buyerId, refId: `offer:${o.id}`, kind: "OFFER_RELEASE", note: "Trial ended — offer returned" });
        await tx.marketOffer.update({ where: { id: o.id }, data: { status: "LAPSED", respondedAt: now } });
      }
      await tx.marketListing.update({ where: { id: l.id }, data: { status: "CANCELLED" } });
    });
  }
  await clearHouseListings(adminId);
  for (const a of await db.auction.findMany({ where: { status: { in: ["LIVE", "SCHEDULED"] } }, select: { id: true } })) await cancelAuction(adminId, a.id);

  // 2. Withdraw squads from matches that haven't locked (entry fees are refunded).
  const openEntries = await db.competitionEntry.findMany({ where: { competition: { status: { in: ["UPCOMING", "OPEN"] } } }, include: { competition: true } });
  for (const e of openEntries) {
    await withTx(async (tx) => {
      if (e.competition.entryFeeMinor > 0) {
        await lockWallet(tx, e.userId);
        await release(tx, { userId: e.userId, refId: `entry:${e.id}`, kind: "ENTRY_REFUND", note: "Trial ended — entry refunded" });
      }
      await tx.competitionSelection.deleteMany({ where: { entryId: e.id } });
      await tx.competitionEntry.delete({ where: { id: e.id } });
    });
  }

  // 3. Every card leaves every club and is retired; unopened packs are revoked.
  const cards = await withTx(
    async (tx) => {
      await tx.cardOwnership.updateMany({ where: { releasedAt: null }, data: { releasedAt: now, releasedVia: "ADMIN", releasedRef: `wipe:${wipeId}` } });
      await tx.favouriteCard.deleteMany({});
      const r = await tx.cardInstance.updateMany({ where: { supplyState: { not: "RETIRED" } }, data: { supplyState: "RETIRED", ownerId: null, lock: "NONE", lockRef: null } });
      await tx.packEntitlement.updateMany({ where: { status: "UNOPENED" }, data: { status: "REVOKED" } });
      return r.count;
    },
    { timeoutMs: 120_000 },
  );

  // 4. MP goes back to zero (append-only ledger: a balancing entry per bucket). £ winnings are kept.
  const balances = await db.walletEntry.groupBy({ by: ["userId", "bucket"], where: { bucket: { in: ["CASH", "BONUS"] } }, _sum: { amountMinor: true } });
  for (const b of balances) {
    const amt = b._sum.amountMinor ?? 0;
    if (amt === 0) continue;
    await db.walletEntry.create({ data: { userId: b.userId, bucket: b.bucket, kind: "ADMIN_ADJUSTMENT", amountMinor: -amt, refId: `wipe:${wipeId}:${b.userId}:${b.bucket}`, note: "Free trial ended — MP reset" } });
  }

  // 5. Fresh supply and a fresh Starter Pack for everyone.
  let minted = 0;
  if (opts.freshRelease) {
    const sport = await footballSport();
    const r = await scheduleRelease(sport.id, now, { perTemplate: { BRONZE: 4, SILVER: 4, GOLD: 3 }, overrides: {} }, adminId);
    minted = (await executeRelease(r.id, adminId)).minted ?? 0;
  }
  let starters = 0;
  if (opts.freshStarter) {
    for (const u of await db.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } })) {
      await withTx((tx) => grantPack(tx, { userId: u.id, skuCode: STARTER_PACK_CODE, source: "STARTER", sourceRef: `starter:${wipeId}:${u.id}` }));
      starters++;
    }
  }
  const summary = { wipeId, cardsRetired: cards, listingsClosed: peer.length, entriesWithdrawn: openEntries.length, mpReset: balances.length, starters, minted };
  await audit(db, { actorId: adminId, action: "trial.wipe", entityType: "System", entityId: wipeId, after: summary });
  return summary;
}
