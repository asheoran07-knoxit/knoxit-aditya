CREATE INDEX "football_fixtures_competition_season_matchday_idx" ON "football_fixtures" USING btree ("competition_key","season_start_year","matchday");--> statement-breakpoint
CREATE INDEX "league_members_user_id_idx" ON "league_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "picks_league_gameweek_idx" ON "picks" USING btree ("league_id","gameweek");