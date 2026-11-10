-- Ruby / Diamond / Rainbow cards are priced by their owners and can be worth far more than a normal
-- card. The app enforces each card's own ceiling (100 MX normal, 1,000 Ruby, 5,000 Diamond,
-- 100,000 Rainbow); the database keeps an absolute backstop at the Rainbow ceiling.
ALTER TABLE "MarketListing" DROP CONSTRAINT "listing_price_max_100mp";
ALTER TABLE "MarketListing" ADD CONSTRAINT "listing_price_max" CHECK ("askingPriceMinor" <= 10000000);
ALTER TABLE "MarketOffer" DROP CONSTRAINT "offer_amount_range";
ALTER TABLE "MarketOffer" ADD CONSTRAINT "offer_amount_range" CHECK ("amountMinor" > 0 AND "amountMinor" <= 10000000);
