-- Special finishes: Ruby (10 per Gold player) joins Diamond (5 per Gold player). Cosmetic only.
CREATE TYPE "CardFinishKind" AS ENUM ('RUBY', 'DIAMOND');

CREATE TABLE "CardFinish" (
    "id" UUID NOT NULL,
    "kind" "CardFinishKind" NOT NULL,
    "playerId" UUID NOT NULL,
    "serial" INTEGER NOT NULL,
    "cardId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardFinish_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CardFinish_cardId_key" ON "CardFinish"("cardId");
CREATE UNIQUE INDEX "CardFinish_playerId_kind_serial_key" ON "CardFinish"("playerId", "kind", "serial");
ALTER TABLE "CardFinish" ADD CONSTRAINT "CardFinish_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardFinish" ADD CONSTRAINT "CardFinish_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Only 10 Rubies and 5 Diamonds of any player, ever.
ALTER TABLE "CardFinish" ADD CONSTRAINT "CardFinish_serial_range" CHECK (
  ("kind" = 'RUBY' AND "serial" BETWEEN 1 AND 10) OR ("kind" = 'DIAMOND' AND "serial" BETWEEN 1 AND 5)
);

-- Keep every Diamond already found.
INSERT INTO "CardFinish" ("id", "kind", "playerId", "serial", "cardId", "createdAt")
SELECT "id", 'DIAMOND', "playerId", "serial", "cardId", "createdAt" FROM "DiamondCard";

DROP TABLE "DiamondCard";
