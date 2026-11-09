-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'DEF', 'MID', 'ATT');

-- CreateEnum
CREATE TYPE "RightsStatus" AS ENUM ('PLACEHOLDER', 'PENDING', 'LICENSED');

-- CreateEnum
CREATE TYPE "CardCategory" AS ENUM ('BRONZE', 'SILVER', 'GOLD');

-- CreateEnum
CREATE TYPE "CardEdition" AS ENUM ('STANDARD', 'STARTER');

-- CreateEnum
CREATE TYPE "CardSupplyState" AS ENUM ('AVAILABLE', 'RECIRCULATING', 'HELD', 'RETIRED');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('TRADEABLE', 'NON_TRADEABLE');

-- CreateEnum
CREATE TYPE "CardLock" AS ENUM ('NONE', 'LISTED', 'COMPETITION');

-- CreateEnum
CREATE TYPE "AcquisitionKind" AS ENUM ('STARTER_PACK', 'PACK', 'MARKET', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReleaseKind" AS ENUM ('MARKET_SALE', 'COLLECTION_COMPLETION', 'ADMIN');

-- CreateEnum
CREATE TYPE "PackKind" AS ENUM ('STARTER', 'REGULAR');

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('STARTER', 'PURCHASE', 'REWARD', 'ADMIN_GRANT', 'DEV');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('UNOPENED', 'OPENED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('SCHEDULED', 'PAUSED', 'EXECUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GameweekStatus" AS ENUM ('UPCOMING', 'OPEN', 'LOCKED', 'PROVISIONAL', 'SETTLED');

-- CreateEnum
CREATE TYPE "FixtureStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CompetitionFormat" AS ENUM ('OPEN', 'BRONZE_ONLY', 'SILVER_ONLY', 'GOLD_ONLY');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('UPCOMING', 'OPEN', 'LOCKED', 'PROVISIONAL', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SelectionSlot" AS ENUM ('STARTER', 'BENCH');

-- CreateEnum
CREATE TYPE "ScoreKind" AS ENUM ('PROVISIONAL', 'FINAL');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('PACK_PURCHASE', 'MARKET_PURCHASE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "emailVerifiedAt" TIMESTAMP(3),
    "emailVerificationToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Sport" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "isTopFlight" BOOLEAN NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "simStrength" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "clubId" UUID,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "nationality" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "rightsStatus" "RightsStatus" NOT NULL DEFAULT 'PLACEHOLDER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "providerRefs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardTemplate" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "category" "CardCategory" NOT NULL,
    "edition" "CardEdition" NOT NULL DEFAULT 'STANDARD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "design" JSONB NOT NULL DEFAULT '{}',
    "maxSupply" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardInstance" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "serial" INTEGER NOT NULL,
    "supplyState" "CardSupplyState" NOT NULL,
    "tradeStatus" "TradeStatus" NOT NULL DEFAULT 'TRADEABLE',
    "ownerId" UUID,
    "lock" "CardLock" NOT NULL DEFAULT 'NONE',
    "lockRef" TEXT,
    "releaseId" UUID,
    "recycledCount" INTEGER NOT NULL DEFAULT 0,
    "mintedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardOwnership" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "acquiredVia" "AcquisitionKind" NOT NULL,
    "acquiredRef" TEXT,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedVia" "ReleaseKind",
    "releasedRef" TEXT,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "CardOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavouriteCard" (
    "userId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavouriteCard_pkey" PRIMARY KEY ("userId","cardId")
);

-- CreateTable
CREATE TABLE "MPValuation" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "category" "CardCategory" NOT NULL,
    "valueMp" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MPValuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackSku" (
    "id" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PackKind" NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "config" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackSku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackEntitlement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "packSkuId" UUID NOT NULL,
    "source" "EntitlementSource" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'UNOPENED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),

    CONSTRAINT "PackEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackOpening" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "packSkuId" UUID NOT NULL,
    "entitlementId" UUID NOT NULL,
    "pricePaidMinor" INTEGER NOT NULL,
    "paymentRef" TEXT,
    "configSnapshot" JSONB NOT NULL,
    "rngAudit" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackOpeningCard" (
    "id" UUID NOT NULL,
    "packOpeningId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "category" "CardCategory" NOT NULL,

    CONSTRAINT "PackOpeningCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyRelease" (
    "id" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'SCHEDULED',
    "plan" JSONB NOT NULL,
    "executedAt" TIMESTAMP(3),
    "cardsMinted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionSet" (
    "id" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reward" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionRequirement" (
    "id" UUID NOT NULL,
    "setId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CollectionRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionCompletion" (
    "id" UUID NOT NULL,
    "setId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cardIds" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gameweek" (
    "id" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "season" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "GameweekStatus" NOT NULL DEFAULT 'UPCOMING',

    CONSTRAINT "Gameweek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" UUID NOT NULL,
    "gameweekId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerFixtureId" TEXT NOT NULL,
    "homeClubId" UUID NOT NULL,
    "awayClubId" UUID NOT NULL,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "status" "FixtureStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "finalisedAt" TIMESTAMP(3),

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerMatchStat" (
    "id" UUID NOT NULL,
    "fixtureId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL,
    "stats" JSONB NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerMatchStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" UUID NOT NULL,
    "sportId" UUID NOT NULL,
    "gameweekId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "CompetitionFormat" NOT NULL,
    "rosterRules" TEXT NOT NULL,
    "scoringRules" TEXT NOT NULL,
    "rewards" JSONB NOT NULL DEFAULT '[]',
    "entryOpensAt" TIMESTAMP(3) NOT NULL,
    "locksAt" TIMESTAMP(3) NOT NULL,
    "status" "CompetitionStatus" NOT NULL DEFAULT 'UPCOMING',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionEntry" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "formation" TEXT NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "provisionalPoints" DOUBLE PRECISION,
    "finalPoints" DOUBLE PRECISION,
    "rank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionSelection" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "slot" "SelectionSlot" NOT NULL,
    "position" "Position" NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "CompetitionSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreCalculation" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "kind" "ScoreKind" NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "totalPoints" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB NOT NULL,
    "inputStatIds" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketListing" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "askingPriceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "buyerId" UUID,
    "soldPriceMinor" INTEGER,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "OrderKind" NOT NULL,
    "refId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "orderId" UUID,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_displayName_key" ON "User"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerificationToken_key" ON "User"("emailVerificationToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_code_key" ON "Sport"("code");

-- CreateIndex
CREATE UNIQUE INDEX "League_code_key" ON "League"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Club_code_key" ON "Club"("code");

-- CreateIndex
CREATE INDEX "Player_sportId_position_idx" ON "Player"("sportId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CardTemplate_playerId_category_edition_version_key" ON "CardTemplate"("playerId", "category", "edition", "version");

-- CreateIndex
CREATE INDEX "CardInstance_supplyState_idx" ON "CardInstance"("supplyState");

-- CreateIndex
CREATE INDEX "CardInstance_ownerId_idx" ON "CardInstance"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CardInstance_templateId_serial_key" ON "CardInstance"("templateId", "serial");

-- CreateIndex
CREATE INDEX "CardOwnership_cardId_idx" ON "CardOwnership"("cardId");

-- CreateIndex
CREATE INDEX "CardOwnership_userId_idx" ON "CardOwnership"("userId");

-- CreateIndex
CREATE INDEX "MPValuation_playerId_category_computedAt_idx" ON "MPValuation"("playerId", "category", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PackSku_code_version_key" ON "PackSku"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PackEntitlement_sourceRef_key" ON "PackEntitlement"("sourceRef");

-- CreateIndex
CREATE INDEX "PackEntitlement_userId_status_idx" ON "PackEntitlement"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PackOpening_entitlementId_key" ON "PackOpening"("entitlementId");

-- CreateIndex
CREATE INDEX "PackOpening_userId_createdAt_idx" ON "PackOpening"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PackOpeningCard_packOpeningId_slotIndex_key" ON "PackOpeningCard"("packOpeningId", "slotIndex");

-- CreateIndex
CREATE INDEX "SupplyRelease_status_scheduledFor_idx" ON "SupplyRelease"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionSet_code_key" ON "CollectionSet"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionRequirement_setId_templateId_key" ON "CollectionRequirement"("setId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionCompletion_idempotencyKey_key" ON "CollectionCompletion"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CollectionCompletion_userId_idx" ON "CollectionCompletion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Gameweek_sportId_season_number_key" ON "Gameweek"("sportId", "season", "number");

-- CreateIndex
CREATE INDEX "Fixture_gameweekId_idx" ON "Fixture"("gameweekId");

-- CreateIndex
CREATE UNIQUE INDEX "Fixture_provider_providerFixtureId_key" ON "Fixture"("provider", "providerFixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEvent_provider_providerEventId_key" ON "ProviderEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "PlayerMatchStat_playerId_isCurrent_idx" ON "PlayerMatchStat"("playerId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMatchStat_fixtureId_playerId_revision_key" ON "PlayerMatchStat"("fixtureId", "playerId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Competition_code_key" ON "Competition"("code");

-- CreateIndex
CREATE INDEX "Competition_gameweekId_idx" ON "Competition"("gameweekId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionEntry_competitionId_userId_key" ON "CompetitionEntry"("competitionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionSelection_entryId_cardId_key" ON "CompetitionSelection"("entryId", "cardId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionSelection_entryId_slot_order_key" ON "CompetitionSelection"("entryId", "slot", "order");

-- CreateIndex
CREATE INDEX "ScoreCalculation_entryId_createdAt_idx" ON "ScoreCalculation"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketListing_status_createdAt_idx" ON "MarketListing"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketListing_cardId_idx" ON "MarketListing"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_providerRef_key" ON "Order"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_entityType_entityId_idx" ON "AdminAuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardTemplate" ADD CONSTRAINT "CardTemplate_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CardTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInstance" ADD CONSTRAINT "CardInstance_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SupplyRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardOwnership" ADD CONSTRAINT "CardOwnership_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardOwnership" ADD CONSTRAINT "CardOwnership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavouriteCard" ADD CONSTRAINT "FavouriteCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavouriteCard" ADD CONSTRAINT "FavouriteCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CardInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MPValuation" ADD CONSTRAINT "MPValuation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackSku" ADD CONSTRAINT "PackSku_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackEntitlement" ADD CONSTRAINT "PackEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackEntitlement" ADD CONSTRAINT "PackEntitlement_packSkuId_fkey" FOREIGN KEY ("packSkuId") REFERENCES "PackSku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpening" ADD CONSTRAINT "PackOpening_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpening" ADD CONSTRAINT "PackOpening_packSkuId_fkey" FOREIGN KEY ("packSkuId") REFERENCES "PackSku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpening" ADD CONSTRAINT "PackOpening_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "PackEntitlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpeningCard" ADD CONSTRAINT "PackOpeningCard_packOpeningId_fkey" FOREIGN KEY ("packOpeningId") REFERENCES "PackOpening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpeningCard" ADD CONSTRAINT "PackOpeningCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyRelease" ADD CONSTRAINT "SupplyRelease_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionSet" ADD CONSTRAINT "CollectionSet_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequirement" ADD CONSTRAINT "CollectionRequirement_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CollectionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionRequirement" ADD CONSTRAINT "CollectionRequirement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CardTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionCompletion" ADD CONSTRAINT "CollectionCompletion_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CollectionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionCompletion" ADD CONSTRAINT "CollectionCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gameweek" ADD CONSTRAINT "Gameweek_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStat" ADD CONSTRAINT "PlayerMatchStat_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStat" ADD CONSTRAINT "PlayerMatchStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionSelection" ADD CONSTRAINT "CompetitionSelection_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionSelection" ADD CONSTRAINT "CompetitionSelection_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionSelection" ADD CONSTRAINT "CompetitionSelection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreCalculation" ADD CONSTRAINT "ScoreCalculation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitionEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── Hand-written integrity constraints (spec §4.3, §7.1, §9.1) ─────────────

-- A card is owned if and only if it is HELD.
ALTER TABLE "CardInstance" ADD CONSTRAINT "card_owner_matches_state"
  CHECK (("supplyState" = 'HELD') = ("ownerId" IS NOT NULL));

-- Only held cards can be locked, and a lock always names what holds it.
ALTER TABLE "CardInstance" ADD CONSTRAINT "card_lock_requires_owner"
  CHECK ("lock" = 'NONE' OR "supplyState" = 'HELD');
ALTER TABLE "CardInstance" ADD CONSTRAINT "card_lock_has_ref"
  CHECK (("lock" = 'NONE') = ("lockRef" IS NULL));

-- Non-tradeable cards can never be listed.
ALTER TABLE "CardInstance" ADD CONSTRAINT "card_nontradeable_not_listed"
  CHECK (NOT ("tradeStatus" = 'NON_TRADEABLE' AND "lock" = 'LISTED'));

-- A card has at most one open ownership record.
CREATE UNIQUE INDEX "card_one_current_owner" ON "CardOwnership" ("cardId") WHERE "releasedAt" IS NULL;

-- A card can only be in one active listing.
CREATE UNIQUE INDEX "listing_one_active_per_card" ON "MarketListing" ("cardId") WHERE "status" = 'ACTIVE';

-- Exactly one current revision per player per fixture.
CREATE UNIQUE INDEX "stat_one_current_revision" ON "PlayerMatchStat" ("fixtureId", "playerId") WHERE "isCurrent";

-- Pool lookups used by the pack engine.
CREATE INDEX "card_pool_lookup" ON "CardInstance" ("templateId") WHERE "supplyState" IN ('AVAILABLE', 'RECIRCULATING');

-- Sanity checks.
ALTER TABLE "CardTemplate" ADD CONSTRAINT "template_max_supply_positive" CHECK ("maxSupply" IS NULL OR "maxSupply" > 0);
ALTER TABLE "MarketListing" ADD CONSTRAINT "listing_price_positive" CHECK ("askingPriceMinor" > 0);
