CREATE TABLE "AppGiveaway" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "packSku" TEXT,
    "mxMinor" INTEGER NOT NULL DEFAULT 0,
    "openUntil" TIMESTAMP(3),
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "AppGiveaway_pkey" PRIMARY KEY ("id")
);
