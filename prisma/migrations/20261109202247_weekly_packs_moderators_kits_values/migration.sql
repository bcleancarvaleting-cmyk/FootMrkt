-- AlterEnum
ALTER TYPE "AcquisitionKind" ADD VALUE 'WEEKLY_PACK';

-- AlterEnum
ALTER TYPE "EntitlementSource" ADD VALUE 'WEEKLY';

-- AlterEnum
ALTER TYPE "PackKind" ADD VALUE 'WEEKLY';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'MODERATOR';

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "kit" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "marketValueAt" TIMESTAMP(3),
ADD COLUMN     "marketValueMinor" INTEGER,
ADD COLUMN     "marketValueSource" TEXT;

-- CreateTable
CREATE TABLE "ModeratorInvite" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "invitedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ModeratorInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModeratorInvite_userId_idx" ON "ModeratorInvite"("userId");

-- AddForeignKey
ALTER TABLE "ModeratorInvite" ADD CONSTRAINT "ModeratorInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeratorInvite" ADD CONSTRAINT "ModeratorInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
