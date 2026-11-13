CREATE TABLE "SiteImage" (
    "id" UUID NOT NULL,
    "bytes" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteImage_pkey" PRIMARY KEY ("id")
);
