-- CreateTable
CREATE TABLE "DiamondCard" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "serial" INTEGER NOT NULL,
    "cardId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiamondCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiamondCard_cardId_key" ON "DiamondCard"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "DiamondCard_playerId_serial_key" ON "DiamondCard"("playerId", "serial");

-- AddForeignKey
ALTER TABLE "DiamondCard" ADD CONSTRAINT "DiamondCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiamondCard" ADD CONSTRAINT "DiamondCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CardInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- At most 5 Diamonds per player, numbered 1-5.
ALTER TABLE "DiamondCard" ADD CONSTRAINT "DiamondCard_serial_range" CHECK ("serial" BETWEEN 1 AND 5);

-- Rarer launch caps (product decision 10 Nov 2026): the 30 most valuable Gold players are "elite"
-- (250 copies each), other Golds 500, Silver 1,500, Bronze 3,000. Never below what's already issued.
WITH issued AS (
  SELECT t.id, COUNT(ci.id) FILTER (WHERE ci."supplyState" <> 'RETIRED') AS n
  FROM "CardTemplate" t LEFT JOIN "CardInstance" ci ON ci."templateId" = t.id
  WHERE t.edition = 'STANDARD'
  GROUP BY t.id
),
elite AS (
  SELECT t.id FROM "CardTemplate" t JOIN "Player" p ON p.id = t."playerId"
  WHERE t.edition = 'STANDARD' AND t.active AND t.category = 'GOLD'
  ORDER BY p."marketValueGbp" DESC NULLS LAST, p."displayName"
  LIMIT 30
)
UPDATE "CardTemplate" t
SET "maxSupply" = GREATEST(
  issued.n,
  CASE
    WHEN t.id IN (SELECT id FROM elite) THEN 250
    WHEN t.category = 'GOLD' THEN 500
    WHEN t.category = 'SILVER' THEN 1500
    ELSE 3000
  END
)
FROM issued
WHERE issued.id = t.id;
