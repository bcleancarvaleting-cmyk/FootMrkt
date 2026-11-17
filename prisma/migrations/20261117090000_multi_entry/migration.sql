-- Paid games can take more than one team per manager.
ALTER TABLE "Competition" ADD COLUMN "maxEntries" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CompetitionEntry" ADD COLUMN "entryNo" INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS "CompetitionEntry_competitionId_userId_key";
CREATE UNIQUE INDEX "CompetitionEntry_competitionId_userId_entryNo_key" ON "CompetitionEntry"("competitionId", "userId", "entryNo");
CREATE INDEX "CompetitionEntry_competitionId_userId_idx" ON "CompetitionEntry"("competitionId", "userId");
