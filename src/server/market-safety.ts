import { createHash } from "node:crypto";
import type { Tx } from "./db";
import { db } from "./db";
import { DomainError } from "./errors";
import { getSetting } from "./settings";

/**
 * Market safeguards for the player-to-player Transfer list:
 *  - new accounts wait a few days (and must confirm their email) before trading;
 *  - sellers confirm prices far above the guide;
 *  - completed sales that look like money moving between linked accounts are held for review.
 * Player drops (MATCHX selling to a manager) aren't affected.
 */
export const REASON_LABEL: Record<string, string> = {
  PAIR_REPEAT: "Same two managers keep trading",
  PRICE_OUTLIER: "Price far above the guide",
  NEW_ACCOUNT: "Big trade by a brand-new account",
  SHARED_NETWORK: "Buyer and seller logged in from the same network",
};

export function hashIp(ip: string | null | undefined) {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT ?? process.env.SESSION_SECRET ?? "matchx-dev-salt";
  return createHash("sha256").update(`${salt}:${ip.trim()}`).digest("hex").slice(0, 32);
}

/** Can this manager trade on the Transfer list yet? */
export async function assertCanTrade(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true, emailVerifiedAt: true, status: true } });
  if (u.status !== "ACTIVE") throw new DomainError("SUSPENDED", "This account can't trade right now. Contact support.");
  if (!u.emailVerifiedAt) throw new DomainError("VERIFY_EMAIL", "Confirm your email address before trading — check your inbox for the link.");
  const days = await getSetting("newTraderDays");
  const opensAt = new Date(u.createdAt.getTime() + days * 86_400_000);
  if (opensAt > new Date()) {
    throw new DomainError("NEW_ACCOUNT", `New accounts can trade from ${opensAt.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. Until then, build your squad from packs and player drops.`);
  }
}

/** Sellers must tick "I'm sure" for a price this many times the guide or more. */
export async function assertSensiblePrice(askingMinor: number, guideMinor: number | null, confirmed: boolean) {
  if (!guideMinor || confirmed) return;
  const multiple = await getSetting("highPriceMultiple");
  if (askingMinor >= guideMinor * multiple) {
    throw new DomainError(
      "HIGH_PRICE",
      `That's ${(askingMinor / guideMinor).toFixed(1)}× the guide price of £${(guideMinor / 100).toFixed(2)}. Tick "I'm sure" to list it anyway.`,
    );
  }
}

/** After a P2P sale (inside its transaction): hold it for review if it looks off. */
export async function reviewSale(tx: Tx, sale: { listingId: string; sellerId: string; buyerId: string; priceMinor: number; guideMinor: number | null }) {
  const reasons: string[] = [];
  const detail: string[] = [];
  const since = new Date(Date.now() - 30 * 86_400_000);
  const pairSales = await tx.marketListing.count({
    where: {
      status: "SOLD",
      soldAt: { gte: since },
      OR: [
        { sellerId: sale.sellerId, buyerId: sale.buyerId },
        { sellerId: sale.buyerId, buyerId: sale.sellerId },
      ],
    },
  });
  if (pairSales >= 3) {
    reasons.push("PAIR_REPEAT");
    detail.push(`${pairSales} trades between these two in 30 days`);
  }
  const multiple = await getSetting("highPriceMultiple");
  if (sale.guideMinor && sale.priceMinor >= sale.guideMinor * multiple * 2) {
    reasons.push("PRICE_OUTLIER");
    detail.push(`${(sale.priceMinor / sale.guideMinor).toFixed(1)}× the guide price`);
  }
  const users = await tx.user.findMany({ where: { id: { in: [sale.sellerId, sale.buyerId] } }, select: { id: true, createdAt: true } });
  const young = users.filter((u) => Date.now() - u.createdAt.getTime() < 7 * 86_400_000);
  if (young.length && sale.priceMinor >= 5_000) {
    reasons.push("NEW_ACCOUNT");
    detail.push(`${young.length === 2 ? "both accounts are" : young[0].id === sale.buyerId ? "the buyer is" : "the seller is"} under a week old`);
  }
  const shared = await tx.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*) AS n FROM "Session" a JOIN "Session" b ON a."ipHash" = b."ipHash"
    WHERE a."userId" = ${sale.sellerId}::uuid AND b."userId" = ${sale.buyerId}::uuid AND a."ipHash" IS NOT NULL`;
  if (Number(shared[0]?.n ?? 0) > 0) {
    reasons.push("SHARED_NETWORK");
    detail.push("both have logged in from the same internet connection");
  }
  if (!reasons.length) return null;
  return tx.tradeFlag.create({ data: { listingId: sale.listingId, sellerId: sale.sellerId, buyerId: sale.buyerId, priceMinor: sale.priceMinor, reasons, detail: detail.join("; ") } });
}

export async function openFlags() {
  const flags = await db.tradeFlag.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 100 });
  const ids = [...new Set(flags.flatMap((f) => [f.sellerId, f.buyerId]))];
  const listingIds = flags.map((f) => f.listingId);
  const [users, listings] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true, createdAt: true, status: true } }),
    db.marketListing.findMany({ where: { id: { in: listingIds } }, select: { id: true, card: { select: { serial: true, template: { select: { category: true, player: { select: { displayName: true } } } } } } } }),
  ]);
  const ageDays = (id: string) => Math.floor((Date.now() - (users.find((u) => u.id === id)?.createdAt.getTime() ?? Date.now())) / 86_400_000);
  return flags.map((f) => ({
    ...f,
    seller: users.find((u) => u.id === f.sellerId)!,
    buyer: users.find((u) => u.id === f.buyerId)!,
    sellerAgeDays: ageDays(f.sellerId),
    buyerAgeDays: ageDays(f.buyerId),
    card: listings.find((l) => l.id === f.listingId)?.card ?? null,
  }));
}

export async function resolveFlag(adminId: string, flagId: string, outcome: "CLEARED" | "ACTIONED", note: string | null, suspend: Array<"seller" | "buyer"> = []) {
  const f = await db.tradeFlag.findUniqueOrThrow({ where: { id: flagId } });
  await db.$transaction(async (tx) => {
    await tx.tradeFlag.update({ where: { id: flagId }, data: { status: outcome, reviewedBy: adminId, reviewedAt: new Date(), note } });
    for (const who of suspend) {
      const userId = who === "seller" ? f.sellerId : f.buyerId;
      await tx.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.adminAuditLog.create({ data: { actorId: adminId, action: "user.suspend", entityType: "User", entityId: userId, after: { reason: `trade review ${flagId}`, note } } });
    }
  });
}
