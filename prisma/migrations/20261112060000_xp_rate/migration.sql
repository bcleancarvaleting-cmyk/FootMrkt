-- 12 Nov 2026: 1,000 XP = £5 (200 XP per £1). Replaces any stored rate.
UPDATE "AppSetting" SET "value" = '200'::jsonb WHERE "key" = 'xpPerMx';
