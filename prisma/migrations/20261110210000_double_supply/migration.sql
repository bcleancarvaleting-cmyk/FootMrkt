-- Double the circulation (product decision 10 Nov 2026).
-- 1) Every standard card design can now have twice as many copies.
UPDATE "CardTemplate" SET "maxSupply" = "maxSupply" * 2 WHERE edition = 'STANDARD' AND "maxSupply" IS NOT NULL;

-- 2) Pending weekly releases put twice as many copies of each design into the pack pool.
UPDATE "SupplyRelease"
SET plan = jsonb_set(
  plan,
  '{perTemplate}',
  jsonb_build_object(
    'BRONZE', (plan->'perTemplate'->>'BRONZE')::int * 2,
    'SILVER', (plan->'perTemplate'->>'SILVER')::int * 2,
    'GOLD',   (plan->'perTemplate'->>'GOLD')::int * 2
  )
)
WHERE status IN ('SCHEDULED', 'PAUSED') AND plan ? 'perTemplate';
