CREATE TABLE "TeamOfTheWeek" (
    "id" UUID NOT NULL,
    "gameweekId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "season" TEXT NOT NULL,
    "picks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TeamOfTheWeek_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeamOfTheWeek_gameweekId_key" ON "TeamOfTheWeek"("gameweekId");
CREATE INDEX "TeamOfTheWeek_expiresAt_idx" ON "TeamOfTheWeek"("expiresAt");
