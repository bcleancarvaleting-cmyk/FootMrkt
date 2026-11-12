ALTER TABLE "Fixture" ADD COLUMN "motmPlayerId" UUID;
-- 12 Nov 2026: Man of the Match bonus. Matches still open for entries move to scoring v3.
UPDATE "Competition" SET "scoringRules" = 'football-scoring-v3-draft' WHERE "status" IN ('UPCOMING', 'OPEN') AND "scoringRules" = 'football-scoring-v2-draft';
