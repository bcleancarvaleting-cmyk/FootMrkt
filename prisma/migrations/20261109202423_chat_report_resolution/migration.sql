-- AlterTable
ALTER TABLE "ChatReport" ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedBy" UUID;
