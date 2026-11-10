-- Gifts can be a free pack, an XP credit or an earned-MX credit.
ALTER TABLE "FreePackDrop" ADD COLUMN "giftType" TEXT NOT NULL DEFAULT 'PACK';
ALTER TABLE "FreePackDrop" ADD COLUMN "amount" INTEGER;
ALTER TABLE "FreePackDrop" ALTER COLUMN "skuCode" DROP NOT NULL;
ALTER TABLE "FreePackDrop" ADD CONSTRAINT "gift_shape" CHECK (
  ("giftType" = 'PACK' AND "skuCode" IS NOT NULL) OR ("giftType" IN ('XP', 'MX') AND "amount" > 0)
);
