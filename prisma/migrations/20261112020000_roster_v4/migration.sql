-- 12 Nov 2026: matches still open for entries move to 7 starters + 1 sub. Existing entries keep their stored squads.
UPDATE "Competition" SET "rosterRules" = 'football-roster-v4' WHERE "status" IN ('UPCOMING', 'OPEN') AND "rosterRules" = 'football-roster-v3';
