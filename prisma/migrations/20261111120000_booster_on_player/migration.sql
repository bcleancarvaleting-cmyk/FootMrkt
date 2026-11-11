-- Boosters go on one player the manager picks, not the whole squad.
ALTER TABLE "CompetitionSelection" ADD COLUMN "isBoosted" BOOLEAN NOT NULL DEFAULT false;
