-- 12 Nov 2026: values in £ to the penny (value-v2).
ALTER TABLE "MPValuation" ALTER COLUMN "valueMp" TYPE DOUBLE PRECISION;
ALTER TABLE "WatchItem" ALTER COLUMN "baselineMp" TYPE DOUBLE PRECISION;
