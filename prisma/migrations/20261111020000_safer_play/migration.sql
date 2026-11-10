ALTER TABLE "User" ADD COLUMN "limitDailyMinor" INTEGER,
  ADD COLUMN "limitWeeklyMinor" INTEGER,
  ADD COLUMN "pendingLimits" JSONB,
  ADD COLUMN "pendingLimitsAt" TIMESTAMP(3),
  ADD COLUMN "timeOutUntil" TIMESTAMP(3),
  ADD COLUMN "selfExcludedUntil" TIMESTAMP(3),
  ADD COLUMN "realityCheckMinutes" INTEGER NOT NULL DEFAULT 60;
