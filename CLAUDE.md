# Knoxit — notes for Claude

## What this is
Knoxit is a football survivor game. Each gameweek a player picks one team to win (plus an optional backup, used only if the primary match is postponed/abandoned). Win = survive; draw or loss = knocked out (unless Draw Shield). Last survivor(s) win the league vault. Competitive leagues auto-place players into 20-player instances per competition + starting gameweek. Friends Leagues are created by users; Knoxit never handles money for them (entryTerms is free text, never parsed).

## Stack
- Frontend: React + Vite + Tailwind + wouter, RTK Query (src/services/api/knoxitApi.ts). Mobile-first, dark theme.
- API: Express 5 in server/src (routes in server/src/routes). Deployed on Render.
- DB: Neon Postgres, Drizzle ORM, schema in lib/db/src/schema.ts.
- Fixtures/results: football-data.org, synced by .github/workflows/sync-football.yml calling POST /api/fixtures/sync.
- Vercel serves the app and proxies /api to Render (api/proxy.ts).

## Rules
- Never commit or push to main. Work on a branch; owner merges.
- No mock data in pages. src/services/mockData is legacy and should eventually be deleted.
- Server is the source of truth for chips, picks, invite codes and lock times. Never trust client values for money or capacity.
- After changes run: npm run typecheck, npm run typecheck:server, npm test, npm run lint.
- End every task with a plain-English summary (owner is non-technical).

## Done (fix/real-data, round 1)
Picks tab, Home dashboard + Your Leagues + Quick Actions, Friends League create/browse/requests/admins, Profile + menu username/balance, Refer & Earn + Invite real code, League Detail members list — all on real API data.

## Done (fix/real-data, round 2a, commit 51710db) — not yet tested against a real database
Friends Leagues now play a real competition: creator picks a competition with an open round and a starting gameweek (next open round or up to 2 later); server validates and sets competitionKey/seasonStartYear/startingRound/currentGameweek/locksAt from fixtures; joins rejected after first lock ("This league has already started"); start moves to the next open round if fewer than 2 members at lock. Friends Leagues created before this have no competition and still can't take picks.

## Done (fix/real-data, round 2b, commit d747cce)
Friends League "Admin must approve every join" setting (leagues.requires_join_approval, migration 0008). ON by default for new leagues via the API; the DB column defaults to false so older leagues keep instant joins. Creator-only toggle on create and on League Settings (PATCH /api/friends-leagues/:id/settings). When ON, invite code/link files a pending join request instead of joining; when OFF, joins instantly. Public request-to-join unchanged. Pending requests auto-declined when the league starts. Approval flow tested end to end against the local test database; auto-decline at lock not yet tested live.

## Before migrating the live database
- Migration 0007 (league_vault_ledger) was added in round 2b because commit 3d8cd34 put that table in the schema without a migration (operations.ts uses it). Check whether the live DB already has the table (e.g. created via db:push). If it does, 0007 will fail on CREATE TABLE and must be skipped or marked applied; if it doesn't, the admin vault tools are currently broken in production.

## Open bugs
- If a short-handed Friends League's lock passes and no later round is synced yet, the league is neither postponed nor started, and joins are rejected. Should stay joinable / be retried on the next sync.
- Fixture sync stale since Aug: needs GitHub secrets BACKEND_SYNC_URL + FOOTBALL_SYNC_SECRET (must equal Render's FOOTBALL_DATA_SYNC_SECRET)
- Shop boosters + Daily Reward not wired to API
- Forgot Password disabled
- League Detail missing chat, history, Split the Vault, settings
- UCL card shows Join when not open; "BETA TEST" vs "BETA"; "Total Chips" labelled "Vault Balance"; placeholder text in Support/Privacy
- No referral field at signup; notification toggles not saved
- Pick screen doesn't show each team's opponent
- Each re-join creates a new near-empty league instance; confirm intended

## Decided product rules
- Join requires confirmation; no leave/refund after joining
- Insufficient chips on join → send user to Shop
- Opponent "Message" button dropped; "Compare" stays in scope
- Lock time = 1 hour before the gameweek's first match; Lock Extension = +15 min for the buyer only, once per league per gameweek
- Split the Vault unlocks at ≤5 alive survivors; needs unanimous agreement; spectators can watch but not vote
