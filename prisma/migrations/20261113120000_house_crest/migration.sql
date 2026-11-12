-- Admins play as the MATCHX house club: their crest becomes the X logo.
UPDATE "User" SET crest = '{"shape":"round","pattern":"plain","emblem":"none","primary":"#111111","secondary":"#ADFC07","accent":"#ADFC07","initials":"MX","est":false,"house":true}'::jsonb
WHERE role = 'ADMIN';
