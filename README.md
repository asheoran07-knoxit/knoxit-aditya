# Knoxit

Production-oriented Knoxit web setup generated from `Plan.txt`, the approved single-file visual prototype, the user journey map, and `Knoxit_Complete_Package.zip`.

## Local setup

```bash
npm install
npm run db:migrate
npm run dev:api
```

In a second terminal:

```bash
npm run dev
```

Copy `.env.example` to `.env` first and replace `DATABASE_URL` with the pooled
connection string from your Neon project. The web app runs on
`http://localhost:5173`; Express runs on `http://localhost:4000`.

Authentication is first-party email/password authentication. Passwords are
scrypt-hashed, and opaque server-side sessions are sent through an HttpOnly,
SameSite cookie. Set `APP_ORIGIN` to the exact web origin in each environment.

## Validate

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run typecheck:server` validates the Express/Drizzle backend separately.

## Deployment shape

Keep the frontend and backend in this repository. `src/` is the Vite web app,
`server/` is the Express API, and `lib/` contains shared database/API contracts.
They can still be deployed as two services from the same repository.

The current Vercel deployment serves the Vite frontend and explicitly rewrites
`/api/*` through `api/proxy.ts` to the Node backend before applying the SPA
fallback. Deploy `server/` to a
Node-compatible service, set its `DATABASE_URL` to Neon, and set Vercel's
`BACKEND_ORIGIN` to that API origin. Keep `VITE_API_BASE_URL` empty so browser
requests and the session cookie stay on the frontend origin. Cross-origin
values are ignored by the client as a safety check because they turn the
session cookie into a third-party cookie that browsers may block.

### Render backend

`render.yaml` defines a Singapore-region `knoxit-api` web service. In Render,
create a Blueprint from this repository and provide:

- `DATABASE_URL`: the pooled Neon connection string
- `APP_ORIGIN`: the exact Vercel frontend URL, with no trailing slash
- `BETA_STARTING_CHIPS`: fixed closed-beta signup allocation (default `1000`)

The Blueprint starts on Render's free instance for testing. Free instances
sleep after inactivity, so upgrade the service before production. The free
configuration runs pending Drizzle migrations during startup; after upgrading,
move `npm run db:migrate` to Render's Pre-Deploy Command and change the Start
Command to `npm run start:api`.

Because the browser reaches the backend through the same-origin `/api` proxy,
leave `COOKIE_SAME_SITE=lax`.

After Render provides the API URL, configure and redeploy the Vercel frontend:

- `BACKEND_ORIGIN=https://knoxit-api.onrender.com` (use the actual URL)
- `VITE_API_BASE_URL=` (empty, or remove the variable)
- `VITE_USE_MOCK_API=false`

### Live football data

The backend caches the current-season fixtures, results, and standings for EPL,
La Liga, Bundesliga, Serie A, and the Champions League in Neon. Configure these
Render variables:

- `FOOTBALL_DATA_API_KEY`: your football-data.org v4 token
- `FOOTBALL_DATA_SYNC_SECRET`: a long random value (the Blueprint generates one)

Run the first sync manually:

```bash
curl --request POST \
  --header "x-sync-secret: YOUR_SYNC_SECRET" \
  https://YOUR-API.onrender.com/api/fixtures/sync
```

`.github/workflows/sync-football.yml` refreshes fixtures every five minutes and
standings every fifteen minutes, offset from the fixture schedule. Before each
sync, it calls `/health` until the Render service has completed any cold start,
then calls the protected sync endpoint. Each pass makes five provider calls. Add
these GitHub Actions repository secrets before enabling it:

- `BACKEND_SYNC_URL`: the backend origin only, such as `https://knoxit-api.onrender.com`
- `FOOTBALL_SYNC_SECRET`: the same value as Render's `FOOTBALL_DATA_SYNC_SECRET`

Use `?mode=fixtures`, `?mode=standings`, or `?mode=full` on the manual sync URL.
The default is `full`. Inspect the active or most recent sync without starting a
new one:

```bash
curl --header "x-sync-secret: YOUR_SYNC_SECRET" \
  https://YOUR-API.onrender.com/api/fixtures/sync/status
```

App users read Neon and never call the provider directly. Free-plan scores and
schedules can be delayed by the provider; true live scores require its live
scores plan. Render Free web services can spin down after 15 minutes without
inbound traffic; the workflow's readiness loop wakes the service and waits up to
eight minutes before failing the run.

Frontend Vercel settings:

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`
- `VITE_USE_MOCK_API=false`
- `VITE_API_BASE_URL=` (empty, or remove the variable)
- `BACKEND_ORIGIN=https://your-api.example.com`

`vercel.json` includes an SPA rewrite so protected and nested routes keep working when users refresh a page.

Public invite links are supported at `/join/CODE` and `/join?code=CODE`.

Users can change the app accent from the drawer's Colour Code picker. Presets and custom `#RRGGBB` values are saved locally in the browser.

## Important Files

- `src/app/router.tsx` - application routes and protected-route wiring.
- `src/services/api/knoxitApi.ts` - RTK Query API layer and `VITE_USE_MOCK_API` mock switch.
- `src/domain/rules.ts` - centralized gameplay and permission rules.
- `server/src/server.ts` - Express route registration.
- `lib/db/src/schema.ts` - Drizzle/Neon Postgres schema.
- `docs/Knoxit_User_Journey_Map.md` - product flow source of truth.
