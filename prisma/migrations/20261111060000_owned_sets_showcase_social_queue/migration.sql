ALTER TABLE "CardFinish" ADD COLUMN "socialStatus" TEXT, ADD COLUMN "socialAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "showcaseCardIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "OwnedSetClaim" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rewardMinor" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OwnedSetClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OwnedSetClaim_userId_code_key" ON "OwnedSetClaim"("userId", "code");
CREATE INDEX "OwnedSetClaim_code_idx" ON "OwnedSetClaim"("code");
