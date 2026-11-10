-- AlterEnum
ALTER TYPE "WalletBucket" ADD VALUE 'WINNINGS';

-- AlterEnum
ALTER TYPE "WalletEntryKind" ADD VALUE 'PRIZE';

-- DropForeignKey
ALTER TABLE "MarketListing" DROP CONSTRAINT "MarketListing_sellerId_fkey";

-- AlterTable
ALTER TABLE "MarketListing" ADD COLUMN     "house" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "sellerId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "WelcomeGift" (
    "id" UUID NOT NULL,
    "skuCode" TEXT NOT NULL,
    "afterDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelcomeGift_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- House listings have no seller; peer listings always do.
ALTER TABLE "MarketListing" ADD CONSTRAINT "listing_house_xor_seller" CHECK (("house" AND "sellerId" IS NULL) OR (NOT "house" AND "sellerId" IS NOT NULL));
ALTER TABLE "WelcomeGift" ADD CONSTRAINT "welcome_after_days" CHECK ("afterDays" >= 0 AND "afterDays" <= 365);
