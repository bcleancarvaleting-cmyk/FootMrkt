-- Matches are only ever created by admins now (11 Nov 2026). Remove the old automatic ones
-- (Freeroll, Free draft, Open, Bronze/Silver/Gold Cup) that haven't started and nobody has entered.
-- Ones with entries are left for an admin to remove (which refunds and unlocks).
DELETE FROM "Competition" c
WHERE c.code ~ '-gw[0-9]+-(freeroll|draft|open|bronze|silver|gold)$'
  AND c.status IN ('UPCOMING', 'OPEN')
  AND NOT EXISTS (SELECT 1 FROM "CompetitionEntry" e WHERE e."competitionId" = c.id);
