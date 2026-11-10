-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'LAPSED');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'SETTLED', 'UNSOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('LEADING', 'OUTBID', 'WON', 'RELEASED');

-- CreateEnum
CREATE TYPE "WalletBucket" AS ENUM ('CASH', 'BONUS');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');

-- AlterEnum
ALTER TYPE "CardSupplyState" ADD VALUE 'RESERVED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WalletEntryKind" ADD VALUE 'CHALLENGE_REWARD';
ALTER TYPE "WalletEntryKind" ADD VALUE 'DEPOSIT';
ALTER TYPE "WalletEntryKind" ADD VALUE 'WITHDRAWAL_HOLD';
ALTER TYPE "WalletEntryKind" ADD VALUE 'WITHDRAWAL_RELEASE';
ALTER TYPE "WalletEntryKind" ADD VALUE 'MARKET_PURCHASE';
ALTER TYPE "WalletEntryKind" ADD VALUE 'MARKET_SALE';
ALTER TYPE "WalletEntryKind" ADD VALUE 'MARKET_FEE';
ALTER TYPE "WalletEntryKind" ADD VALUE 'OFFER_HOLD';
ALTER TYPE "WalletEntryKind" ADD VALUE 'OFFER_RELEASE';
ALTER TYPE "WalletEntryKind" ADD VALUE 'AUCTION_HOLD';
ALTER TYPE "WalletEntryKind" ADD VALUE 'AUCTION_RELEASE';
ALTER TYPE "WalletEntryKind" ADD VALUE 'ENTRY_FEE';
ALTER TYPE "WalletEntryKind" ADD VALUE 'ENTRY_REFUND';

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "entryFeeMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requirements" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "MarketListing" ADD COLUMN     "feeMinor" INTEGER,
ALTER COLUMN "currency" SET DEFAULT 'MP';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "depositLimitMonthlyMinor" INTEGER,
ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "fundsRiskAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "kycStatus" "KycStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postcode" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- AlterTable
ALTER TABLE "WalletEntry" ADD COLUMN     "bucket" "WalletBucket" NOT NULL DEFAULT 'BONUS';

-- CreateTable
CREATE TABLE "MarketOffer" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "buyerId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "MarketOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "startPriceMinor" INTEGER NOT NULL,
    "minIncrementMinor" INTEGER NOT NULL DEFAULT 10,
    "reserveMinor" INTEGER,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "antiSnipeMinutes" INTEGER NOT NULL DEFAULT 2,
    "status" "AuctionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "winnerId" UUID,
    "winningBidMinor" INTEGER,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionBid" (
    "id" UUID NOT NULL,
    "auctionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "status" "BidStatus" NOT NULL DEFAULT 'LEADING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processedBy" UUID,
    "payoutRef" TEXT,
    "note" TEXT,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreePackDrop" (
    "id" UUID NOT NULL,
    "skuCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreePackDrop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "rewardMinor" INTEGER NOT NULL DEFAULT 0,
    "rewardPackSku" TEXT,
    "maxPerUser" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeCompletion" (
    "id" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cardIds" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketOffer_listingId_status_idx" ON "MarketOffer"("listingId", "status");

-- CreateIndex
CREATE INDEX "MarketOffer_buyerId_status_idx" ON "MarketOffer"("buyerId", "status");

-- CreateIndex
CREATE INDEX "Auction_status_endsAt_idx" ON "Auction"("status", "endsAt");

-- CreateIndex
CREATE INDEX "AuctionBid_auctionId_amountMinor_idx" ON "AuctionBid"("auctionId", "amountMinor");

-- CreateIndex
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FreePackDrop_startsAt_endsAt_idx" ON "FreePackDrop"("startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_code_key" ON "Challenge"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeCompletion_idempotencyKey_key" ON "ChallengeCompletion"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ChallengeCompletion_userId_challengeId_idx" ON "ChallengeCompletion"("userId", "challengeId");

-- AddForeignKey
ALTER TABLE "MarketOffer" ADD CONSTRAINT "MarketOffer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOffer" ADD CONSTRAINT "MarketOffer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeCompletion" ADD CONSTRAINT "ChallengeCompletion_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeCompletion" ADD CONSTRAINT "ChallengeCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────── Hand-written guards ─────────────
-- P2P prices: 0.01 to 100 MP (MP hundredths).
ALTER TABLE "MarketListing" ADD CONSTRAINT "listing_price_max_100mp" CHECK ("askingPriceMinor" <= 10000);
ALTER TABLE "MarketOffer" ADD CONSTRAINT "offer_amount_range" CHECK ("amountMinor" > 0 AND "amountMinor" <= 10000);
-- Withdrawals are at least £10.
ALTER TABLE "Withdrawal" ADD CONSTRAINT "withdrawal_min_10" CHECK ("amountMinor" >= 1000);
-- A card can only be in one open house auction at a time.
CREATE UNIQUE INDEX "auction_one_open_per_card" ON "Auction" ("cardId") WHERE "status" IN ('SCHEDULED', 'LIVE');
-- One pending offer per buyer per listing.
CREATE UNIQUE INDEX "offer_one_pending_per_buyer" ON "MarketOffer" ("listingId", "buyerId") WHERE "status" = 'PENDING';
ALTER TABLE "FreePackDrop" ADD CONSTRAINT "drop_window" CHECK ("endsAt" > "startsAt");
