-- Balances are shown in £ now: update the seeded challenge descriptions that still say MX.
UPDATE "Challenge" SET description = 'Hand in any 7 cards — a full starting line-up — for £1.' WHERE description = 'Hand in any 7 cards — a full starting line-up — for 1 MX.';
UPDATE "Challenge" SET description = regexp_replace(description, '(\d+(\.\d+)?) MX', '£\1', 'g') WHERE description ~ '\d MX';
