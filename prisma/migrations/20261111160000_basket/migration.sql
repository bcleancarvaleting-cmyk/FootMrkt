CREATE TABLE "BasketItem" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BasketItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BasketItem_userId_listingId_key" ON "BasketItem"("userId", "listingId");
CREATE INDEX "BasketItem_userId_idx" ON "BasketItem"("userId");
