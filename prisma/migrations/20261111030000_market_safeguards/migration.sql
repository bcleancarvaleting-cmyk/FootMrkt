ALTER TABLE "Session" ADD COLUMN "ipHash" TEXT;
CREATE INDEX "Session_ipHash_idx" ON "Session"("ipHash");

CREATE TABLE "TradeFlag" (
  "id" UUID NOT NULL,
  "listingId" UUID NOT NULL,
  "sellerId" UUID NOT NULL,
  "buyerId" UUID NOT NULL,
  "priceMinor" INTEGER NOT NULL,
  "reasons" TEXT[],
  "detail" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "reviewedBy" UUID,
  "reviewedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TradeFlag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TradeFlag_listingId_key" ON "TradeFlag"("listingId");
CREATE INDEX "TradeFlag_status_createdAt_idx" ON "TradeFlag"("status", "createdAt");
