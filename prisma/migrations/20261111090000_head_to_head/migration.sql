CREATE TABLE "H2HChallenge" (
  "id" UUID NOT NULL,
  "gameweekId" UUID NOT NULL,
  "challengerId" UUID NOT NULL,
  "opponentId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "challengerPoints" DOUBLE PRECISION,
  "opponentPoints" DOUBLE PRECISION,
  "winnerId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "H2HChallenge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "H2HChallenge_gameweekId_challengerId_opponentId_key" ON "H2HChallenge"("gameweekId", "challengerId", "opponentId");
CREATE INDEX "H2HChallenge_challengerId_idx" ON "H2HChallenge"("challengerId");
CREATE INDEX "H2HChallenge_opponentId_idx" ON "H2HChallenge"("opponentId");
CREATE INDEX "H2HChallenge_status_gameweekId_idx" ON "H2HChallenge"("status", "gameweekId");
