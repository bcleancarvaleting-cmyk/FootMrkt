ALTER TABLE "CompetitionEntry" ADD COLUMN "boosterKind" TEXT;
CREATE TABLE "BoosterPack" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "weekKey" TEXT NOT NULL,
  "kind" TEXT,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "openedAt" TIMESTAMP(3),
  "usedEntryId" UUID,
  "usedAt" TIMESTAMP(3),
  "remindedAt" TIMESTAMP(3),
  CONSTRAINT "BoosterPack_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BoosterPack_usedEntryId_key" ON "BoosterPack"("usedEntryId");
CREATE UNIQUE INDEX "BoosterPack_userId_weekKey_key" ON "BoosterPack"("userId", "weekKey");
CREATE INDEX "BoosterPack_userId_expiresAt_idx" ON "BoosterPack"("userId", "expiresAt");
