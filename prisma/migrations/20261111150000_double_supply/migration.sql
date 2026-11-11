-- Double the card supply before launch (product decision 11 Nov 2026): Gold, Silver, Bronze caps
-- ×2 (elite Golds 250 → 500), Rubies 10 → 20 and Diamonds 5 → 10 per Gold player. Rainbows stay one of one.
UPDATE "CardTemplate" SET "maxSupply" = "maxSupply" * 2 WHERE "edition" = 'STANDARD' AND "maxSupply" IS NOT NULL;
ALTER TABLE "CardFinish" DROP CONSTRAINT "CardFinish_serial_range";
ALTER TABLE "CardFinish" ADD CONSTRAINT "CardFinish_serial_range" CHECK (
  ("kind" = 'RUBY' AND "serial" BETWEEN 1 AND 20)
  OR ("kind" = 'DIAMOND' AND "serial" BETWEEN 1 AND 10)
  OR ("kind" = 'RAINBOW' AND "serial" = 1)
);
