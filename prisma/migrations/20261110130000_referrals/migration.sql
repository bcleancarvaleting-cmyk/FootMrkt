-- Refer a friend: who invited each manager.
ALTER TABLE "User" ADD COLUMN "referredById" UUID;
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_referredById_idx" ON "User"("referredById");
ALTER TABLE "User" ADD CONSTRAINT "no_self_referral" CHECK ("referredById" IS NULL OR "referredById" <> "id");
