ALTER TABLE "User" ADD COLUMN "tourSeenAt" TIMESTAMP(3);
-- Managers who already play have found their way round: only new sign-ups get the tour
-- (anyone can replay it from Guides).
UPDATE "User" SET "tourSeenAt" = CURRENT_TIMESTAMP WHERE "createdAt" < CURRENT_TIMESTAMP - INTERVAL '1 day';
