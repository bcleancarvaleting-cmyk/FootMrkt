ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT,
  ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
  ADD COLUMN "totpLastStep" INTEGER,
  ADD COLUMN "backupCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "passwordResetHash" TEXT,
  ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_passwordResetHash_key" ON "User"("passwordResetHash");

CREATE TABLE "SupportTicket" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "email" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "pagePath" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "adminNote" TEXT,
  "resolvedBy" UUID,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");
