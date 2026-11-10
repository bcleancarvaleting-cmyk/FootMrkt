-- CreateTable
CREATE TABLE "CardStamp" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "gameweek" INTEGER NOT NULL,
    "competitionId" UUID NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardStamp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardStamp_userId_idx" ON "CardStamp"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardStamp_cardId_kind_competitionId_key" ON "CardStamp"("cardId", "kind", "competitionId");

-- AddForeignKey
ALTER TABLE "CardStamp" ADD CONSTRAINT "CardStamp_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

