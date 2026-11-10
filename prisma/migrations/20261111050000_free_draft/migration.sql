-- Free draft: selections can be a player without a card.
ALTER TABLE "CompetitionSelection" ALTER COLUMN "cardId" DROP NOT NULL;
CREATE UNIQUE INDEX "CompetitionSelection_entryId_playerId_draft_key" ON "CompetitionSelection"("entryId", "playerId") WHERE "cardId" IS NULL;
