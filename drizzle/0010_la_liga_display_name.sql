-- Display "La Liga" instead of football-data.org's "Primera Division".
-- The sync now writes Knoxit's own names; this fixes rows written before.
UPDATE "football_competitions" SET "name" = 'La Liga' WHERE "key" = 'la_liga';--> statement-breakpoint
UPDATE "leagues" SET "name" = 'La Liga Survivor' WHERE "competition_key" = 'la_liga' AND "type" = 'competitive' AND "name" = 'Primera Division Survivor';
