CREATE TABLE "PromoClaim" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "usedAt" TIMESTAMP(3),
  "usedRef" TEXT,
  CONSTRAINT "PromoClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PromoClaim_userId_code_key" ON "PromoClaim"("userId", "code");
ALTER TABLE "PromoClaim" ADD CONSTRAINT "PromoClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
