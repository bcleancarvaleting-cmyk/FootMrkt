-- Injuries and suspensions from Sportmonks (shown on the start guide; 0% while out).
ALTER TABLE "Player" ADD COLUMN "sidelinedKind" TEXT;
ALTER TABLE "Player" ADD COLUMN "sidelinedReason" TEXT;
ALTER TABLE "Player" ADD COLUMN "sidelinedUntil" TIMESTAMP(3);
