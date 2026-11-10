-- AlterTable
ALTER TABLE "CompetitionSelection" ADD COLUMN     "isCaptain" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appInstalledAt" TIMESTAMP(3),
ADD COLUMN     "appPlatform" TEXT,
ADD COLUMN     "favouriteClubId" UUID,
ADD COLUMN     "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notificationsUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" UUID,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_favouriteClubId_fkey" FOREIGN KEY ("favouriteClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most one captain per entry, and only a starter can be captain.
CREATE UNIQUE INDEX "one_captain_per_entry" ON "CompetitionSelection" ("entryId") WHERE "isCaptain";
ALTER TABLE "CompetitionSelection" ADD CONSTRAINT "captain_is_starter" CHECK (NOT "isCaptain" OR "slot" = 'STARTER');
