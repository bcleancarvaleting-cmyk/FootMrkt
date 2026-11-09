/*
  Warnings:

  - You are about to drop the column `marketValueMinor` on the `Player` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Player" DROP COLUMN "marketValueMinor",
ADD COLUMN     "marketValueGbp" INTEGER;
