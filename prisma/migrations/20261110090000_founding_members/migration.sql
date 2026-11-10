-- Founding members: everyone who joined during the free trial gets a permanent number.
ALTER TABLE "User" ADD COLUMN "foundingNumber" INTEGER;
CREATE UNIQUE INDEX "User_foundingNumber_key" ON "User"("foundingNumber");
ALTER TABLE "User" ADD CONSTRAINT "founding_number_positive" CHECK ("foundingNumber" IS NULL OR "foundingNumber" > 0);
