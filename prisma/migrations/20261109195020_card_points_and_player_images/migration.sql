-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "imageCredit" TEXT,
ADD COLUMN     "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "CardPoints" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardPoints_userId_cardId_idx" ON "CardPoints"("userId", "cardId");

-- CreateIndex
CREATE UNIQUE INDEX "CardPoints_entryId_cardId_key" ON "CardPoints"("entryId", "cardId");

-- AddForeignKey
ALTER TABLE "CardPoints" ADD CONSTRAINT "CardPoints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPoints" ADD CONSTRAINT "CardPoints_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPoints" ADD CONSTRAINT "CardPoints_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPoints" ADD CONSTRAINT "CardPoints_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitionEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
