CREATE TABLE "WaitlistEntry" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "clubCode" TEXT,
    "over18" BOOLEAN NOT NULL,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "refCode" TEXT NOT NULL,
    "referredBy" TEXT,
    "referrals" INTEGER NOT NULL DEFAULT 0,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "referrerHost" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "launchEmailedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "convertedUserId" UUID,
    "convertedAt" TIMESTAMP(3),
    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WaitlistEntry_email_key" ON "WaitlistEntry"("email");
CREATE UNIQUE INDEX "WaitlistEntry_refCode_key" ON "WaitlistEntry"("refCode");
CREATE INDEX "WaitlistEntry_createdAt_idx" ON "WaitlistEntry"("createdAt");
CREATE INDEX "WaitlistEntry_referredBy_idx" ON "WaitlistEntry"("referredBy");
