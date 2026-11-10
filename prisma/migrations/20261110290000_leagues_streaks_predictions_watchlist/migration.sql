-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bestStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActiveDay" TEXT,
ADD COLUMN     "loginStreak" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MiniLeague" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiniLeague_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiniLeagueMember" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiniLeagueMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionQuestion" (
    "id" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "playerId" UUID NOT NULL,
    "fixtureId" UUID NOT NULL,
    "locksAt" TIMESTAMP(3) NOT NULL,
    "answer" BOOLEAN,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PredictionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionAnswer" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "guess" BOOLEAN NOT NULL,
    "correct" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "maxPriceMinor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MiniLeague_code_key" ON "MiniLeague"("code");

-- CreateIndex
CREATE INDEX "MiniLeagueMember_userId_idx" ON "MiniLeagueMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MiniLeagueMember_leagueId_userId_key" ON "MiniLeagueMember"("leagueId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionQuestion_day_key" ON "PredictionQuestion"("day");

-- CreateIndex
CREATE INDEX "PredictionAnswer_userId_idx" ON "PredictionAnswer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionAnswer_questionId_userId_key" ON "PredictionAnswer"("questionId", "userId");

-- CreateIndex
CREATE INDEX "WatchItem_playerId_idx" ON "WatchItem"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchItem_userId_playerId_key" ON "WatchItem"("userId", "playerId");

-- AddForeignKey
ALTER TABLE "MiniLeagueMember" ADD CONSTRAINT "MiniLeagueMember_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "MiniLeague"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionAnswer" ADD CONSTRAINT "PredictionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "PredictionQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

