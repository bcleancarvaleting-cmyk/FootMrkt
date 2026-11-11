CREATE TABLE "SeasonArchive" (
  "id" UUID NOT NULL,
  "season" TEXT NOT NULL,
  "standings" JSONB NOT NULL,
  "champion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeasonArchive_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SeasonArchive_season_key" ON "SeasonArchive"("season");
