# Knoxit rollback runbook

## Before deployment

1. Run `npm run lint`, both typechecks, tests, and the production build.
2. Record the Git commit being deployed and the currently running commit.
3. Confirm the latest Neon restore point or backup is usable.
4. Apply migrations before enabling the results engine or operations portal.
5. Run one fixture sync and verify `/health/ready` returns HTTP 200.

## Immediate containment

- Incorrect automatic outcomes: set `RESULTS_ENGINE_ENABLED=false` and redeploy.
  Fixture ingestion continues but no memberships or picks are changed.
- Suspicious administration activity: set `OPERATIONS_ENABLED=false` and
  redeploy. Existing audit and ledger records remain readable in Neon.
- Provider or stale-data incident: leave both kill switches off until the
  provider cache is inspected; do not manually overwrite pick outcomes.

## Application rollback

1. In Render, roll back to the recorded previous successful deploy. Free Render
   services retain only their two most recent deploys, so do this promptly.
2. Roll Vercel back to the corresponding previous frontend deployment.
3. Check `/health`, login, league detail, and pick submission.
4. Keep the additive `0005` and `0006` database migrations in place. Their columns,
   new enum values, and new audit table are backwards-compatible with the prior
   application. Do not remove enum values during an incident.

## Data recovery

- Never repair balances by editing `users.chip_balance` or `leagues.vault_chips`
  alone. Use a reason-coded compensating ledger transaction after the portal is
  verified, or execute the equivalent transaction under engineering review.
- Automatic result writes are idempotent, but a factually incorrect provider
  result needs an audited correction procedure. Preserve affected pick and
  membership rows before changing them.
- Restore the database only when data corruption cannot be corrected with
  compensating records. Restoring Neon can discard newer legitimate writes.

## Recovery validation

1. Re-enable one kill switch at a time.
2. Trigger a manual fixture sync and inspect `/api/fixtures/sync/status`.
3. Run the fresh-account journey: signup, join, submit, simulate a finished
   fixture, sync, and confirm the persisted survivor or knockout outcome.
4. Confirm UptimeRobot sees `/health/ready` as healthy and alerts are delivered.
5. Record the incident, commands/actions, actors, timestamps, and final commit.
