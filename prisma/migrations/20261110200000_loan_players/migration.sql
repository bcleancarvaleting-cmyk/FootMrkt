-- AlterEnum
ALTER TYPE "CardEdition" ADD VALUE 'LOAN';

-- AlterTable
ALTER TABLE "CardInstance" ADD COLUMN     "loanGameweeks" INTEGER;

