import { audit } from "./audit";
import { db } from "./db";
import { DomainError } from "./errors";
import { grantStarterPack } from "./packs";

/**
 * Admin → Settings → "Reset for launch" (product decision 13 Nov 2026): clear the beta test so
 * everyone registers and starts again — keeping all the data.
 *
 * KEPT: leagues, clubs, players, card designs, values and price history, real gameweeks, fixtures
 *   and stats, pack setup and supply, challenges and sets, player drops still on sale, settings, keys
 *   and switches, the waitlist and the audit log. The MATCHX market is restocked: 3 of every player.
 * CLEARED: every account except admins; every card anyone owned goes back into the pool (rare
 *   Ruby / Diamond / Rainbow finds included, so they can be found again); balances, XP, orders,
 *   packs, entries, transfers, auctions, offers, leagues, chat, notifications, achievements and
 *   simulated matchdays. Admins keep their login and get a fresh starter pack.
 *
 * One transaction: it all happens, or nothing does. Typing the confirm phrase is required.
 */
export const RESET_PHRASE = "RESET FOR LAUNCH";

const WIPE = [
  "PackOpeningCard", "PackOpening", "PackEntitlement", "CardPoints", "CompetitionSelection", "ScoreCalculation", "CompetitionEntry",
  "MarketOffer", "AuctionBid", "Auction", "BasketItem", "WalletEntry", "Withdrawal", "PaymentEvent", "Order", "PromoClaim",
  "ChallengeCompletion", "CollectionCompletion", "OwnedSetClaim", "CardStamp", "CardFinish", "CardOwnership", "FavouriteCard",
  "WatchItem", "UserAchievement", "Notification", "MiniLeagueMember", "MiniLeague", "PredictionAnswer", "ChatReport", "ChatMessage",
  "ModeratorInvite", "EmailLog", "SupportTicket", "PushSubscription", "H2HChallenge", "BoosterPack", "Moment", "TradeFlag", "ErrorLog",
];

export async function resetForLaunch(actorId: string, phrase: string) {
  if (phrase.trim().toUpperCase() !== RESET_PHRASE) throw new DomainError("CONFIRM", `Type ${RESET_PHRASE} to confirm.`);
  const result = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(777002)`;
      const admins = (await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((u) => u.id);
      if (!admins.length) throw new DomainError("NO_ADMIN", "No admin account found — nothing was changed.");
      const players = await tx.user.count({ where: { role: { not: "ADMIN" } } });

      // 1. Everything players did.
      await tx.$executeRawUnsafe(`TRUNCATE ${WIPE.map((t) => `"${t}"`).join(", ")}`);
      // Transfer-list history and the old MATCHX market go (restocked with 3 of each below);
      // player drops still on sale stay.
      await tx.$executeRaw`
        DELETE FROM "MarketListing" ml WHERE NOT (ml.house AND ml.status = 'ACTIVE' AND EXISTS (SELECT 1 FROM "CardInstance" c WHERE c.id = ml."cardId" AND NOT c.packable))`;

      // 2. Cards: free starter and loan copies go; every other card back into the pool, unowned.
      await tx.$executeRaw`DELETE FROM "CardInstance" c USING "CardTemplate" t WHERE t.id = c."templateId" AND t.edition IN ('STARTER', 'LOAN')`;
      await tx.$executeRaw`
        UPDATE "CardInstance" c SET "ownerId" = NULL, lock = 'NONE', "lockRef" = NULL, "tradeStatus" = 'TRADEABLE', "recycledCount" = 0,
          "supplyState" = 'AVAILABLE', packable = true
        WHERE c."supplyState" IN ('HELD', 'RECIRCULATING', 'RESERVED')
          AND NOT EXISTS (SELECT 1 FROM "MarketListing" ml WHERE ml."cardId" = c.id AND ml.house AND ml.status = 'ACTIVE')`;

      // 3. Simulated matchdays (test games) go; real gameweeks and results stay.
      await tx.$executeRaw`DELETE FROM "PlayerMatchStat" s USING "Fixture" f, "Gameweek" g WHERE f.id = s."fixtureId" AND g.id = f."gameweekId" AND g.simulated`;
      await tx.$executeRaw`DELETE FROM "Fixture" f USING "Gameweek" g WHERE g.id = f."gameweekId" AND g.simulated`;
      await tx.$executeRaw`DELETE FROM "Competition" c USING "Gameweek" g WHERE g.id = c."gameweekId" AND g.simulated`;
      await tx.$executeRaw`DELETE FROM "TeamOfTheWeek" w USING "Gameweek" g WHERE g.id = w."gameweekId" AND g.simulated`;
      await tx.$executeRaw`DELETE FROM "Gameweek" WHERE simulated`;

      // 4. Accounts: everyone but admins. Waitlist sign-ups can claim their launch gift again.
      await tx.$executeRaw`UPDATE "AdminAuditLog" SET "actorId" = NULL WHERE "actorId" IS NOT NULL AND "actorId" <> ALL(${admins}::uuid[])`;
      await tx.$executeRaw`UPDATE "User" SET "referredById" = NULL`;
      await tx.$executeRaw`DELETE FROM "Session" WHERE "userId" <> ALL(${admins}::uuid[])`;
      await tx.$executeRaw`DELETE FROM "User" WHERE role <> 'ADMIN'`;
      await tx.$executeRaw`UPDATE "WaitlistEntry" SET "convertedUserId" = NULL, "convertedAt" = NULL`;
      await tx.$executeRaw`UPDATE "User" SET "loginStreak" = 0, "bestStreak" = 0, "lastActiveDay" = NULL, "kycStatus" = 'NONE'`;
      await tx.$executeRaw`DELETE FROM "AppSetting" WHERE key LIKE 'referral.prizes.%'`;

      // 5. Admins start like everyone else: a fresh starter pack.
      for (const id of admins) await grantStarterPack(tx, id);

      const cards = await tx.cardInstance.count({ where: { supplyState: "AVAILABLE" } });
      await audit(tx, { actorId, action: "launch.reset", entityType: "Database", entityId: "game", after: { playersRemoved: players, admins: admins.length, cardsInPool: cards } });
      return { playersRemoved: players, admins: admins.length, cardsInPool: cards };
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
  // The MATCHX market, fresh: 3 copies of every player at their current value.
  const { MARKET_COPIES, releaseMarketBatch } = await import("./transfers");
  const market = await releaseMarketBatch(actorId, { perPlayer: MARKET_COPIES, days: 14 });
  return { ...result, marketListed: market.listed };
}
