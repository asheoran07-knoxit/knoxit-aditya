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

## Open bugs
- Friends Leagues are created with no competition (no competitionKey/startingRound/gameweek), so members probably can't make picks in them. Needs a product decision: creator picks a competition + starting gameweek.
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
