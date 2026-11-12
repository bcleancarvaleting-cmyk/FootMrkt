CREATE TABLE "Moment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "href" TEXT,
    "cta" TEXT,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shownAt" TIMESTAMP(3),
    CONSTRAINT "Moment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Moment_key_key" ON "Moment"("key");
CREATE INDEX "Moment_userId_shownAt_idx" ON "Moment"("userId", "shownAt");
