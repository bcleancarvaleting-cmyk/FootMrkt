-- Launch supply caps (product decision 10 Nov 2026): every standard card design can have up to
-- 1,000 Gold / 3,000 Silver / 8,000 Bronze copies. Issued cards are untouched.
UPDATE "CardTemplate"
SET "maxSupply" = CASE category WHEN 'GOLD' THEN 1000 WHEN 'SILVER' THEN 3000 ELSE 8000 END
WHERE edition = 'STANDARD';
