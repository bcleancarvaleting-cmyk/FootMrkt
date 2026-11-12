ALTER TABLE "PromoClaim" ADD COLUMN "uses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PromoClaim" ADD COLUMN "usedRefs" TEXT[] DEFAULT ARRAY[]::TEXT[];
-- Existing one-use claims: count the use they had, and reopen them (MATCHX is now 3 uses).
UPDATE "PromoClaim" SET "uses" = 1, "usedRefs" = ARRAY["usedRef"], "usedAt" = NULL WHERE "usedAt" IS NOT NULL AND "usedRef" IS NOT NULL;
