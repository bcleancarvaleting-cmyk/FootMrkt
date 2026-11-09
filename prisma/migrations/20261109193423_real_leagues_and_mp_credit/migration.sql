-- CreateEnum
CREATE TYPE "WalletEntryKind" AS ENUM ('SET_REWARD', 'PACK_PURCHASE', 'ADMIN_ADJUSTMENT');

-- AlterEnum
ALTER TYPE "EntitlementSource" ADD VALUE 'MP_CREDIT';

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "crestUrl" TEXT,
ADD COLUMN     "primaryColour" TEXT NOT NULL DEFAULT '#2a2f38',
ADD COLUMN     "secondaryColour" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN     "sourceRef" TEXT;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "squadNumber" INTEGER;

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "WalletEntryKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "refId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_refId_key" ON "WalletEntry"("refId");

-- CreateIndex
CREATE INDEX "WalletEntry_userId_createdAt_idx" ON "WalletEntry"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MP credit ledger is append-only (spec §11: immutable entries, no editable balances).
CREATE FUNCTION wallet_entry_immutable() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'WalletEntry rows are immutable';
END;
$fn$ LANGUAGE plpgsql;
CREATE TRIGGER wallet_entry_no_update BEFORE UPDATE OR DELETE ON "WalletEntry"
  FOR EACH ROW EXECUTE FUNCTION wallet_entry_immutable();
