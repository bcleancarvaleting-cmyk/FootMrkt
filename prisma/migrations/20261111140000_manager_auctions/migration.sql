-- Manager auctions: a seller's own card, with an optional buy-it-now price.
ALTER TABLE "Auction" ADD COLUMN "sellerId" UUID, ADD COLUMN "buyNowMinor" INTEGER;
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Auction_sellerId_idx" ON "Auction"("sellerId");
