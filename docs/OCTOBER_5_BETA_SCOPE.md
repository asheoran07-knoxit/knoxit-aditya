# Knoxit October 5 Closed Beta Scope

Saved from the planning session on 18 August 2026.

## Scope commitment

- Deadline: 5 October 2026
- Included tasks: 38 of 112
- Deferred tasks: 74 of 112
- Scope reduction: 66.1%
- Release type: closed beta with beta chips; no purchases or cash withdrawals

Included task numbers:

`#2, #3, #11-16, #18, #21, #22, #24, #42, #45-53, #59, #62, #67, #68, #79-82, #89-91, #104, #109-112`

## Implementation progress

### 19 August 2026

- Implemented the account/session and beta-wallet foundation for #11-16, #18, #68, and #91.
- Signup now atomically creates the account, 1,000-chip starting allocation, signup ledger entry, and initial session.
- Login/session routing uses the same-origin mobile-safe API path; logout clears private API cache.
- Implemented the code path for #2, #3, and #22: real Home/Explore competition discovery, live lock labels, HOT state, server-backed Join Now, retry-safe idempotency, atomic membership/fee/vault update, and exact insufficient-chip feedback.
- Real chip balance is now shown from the same API source in the global header, Explore, and Shop.
- Verification: web and server typechecks, ESLint, 20 automated tests, production build, and `git diff --check` pass.
- Still required before these tasks are accepted as production-complete: apply migrations/configuration in the target environment and execute the fresh-account/mobile/database smoke flow.

### 23 August 2026

- Implemented the code path for #21: a selected My Leagues or post-join card opens its exact server-backed league, and non-members receive a 403 instead of another league's data.
- Implemented the code path for #24: League Detail now shows the real name, code, gameweek, status, vault, survivor/joined counts, local lock time, and a ticking countdown aligned to `serverNow`.
- Implemented the code path for #42: Take Action appears only for an alive member in an upcoming/active league, before lock, with no current-gameweek pick; submitted, knocked-out, locked, completed, and split states show their specific non-action state.
- Removed mock chat, history, survivor, score, and split interactions from League Detail so deferred features are not presented as live beta data.
- Verification: web and server typechecks, ESLint, 21 automated tests, and the production build pass.
- Still required for production acceptance: UI smoke the joined league with a real database before lock, after submitting a pick, as a non-member, and after lock.

## End-to-end journey

```text
Open app
  -> Sign up or log in
  -> Receive and display beta chip balance
  -> Discover an available league
  -> Review its entry fee and join
  -> Deduct chips and create membership atomically
  -> Open the correct League Detail
  -> Show Take Action when a pick is required
  -> Select eligible primary and backup teams
  -> Review and submit reliably
  -> Allow editing until the server-controlled lock
  -> Synchronize fixtures and final results
  -> Evaluate primary, then backup when required
  -> Persist the active or knocked-out outcome
```

## Account and session

- #11 creates exactly one account and a beta-chip wallet.
- #12 rejects an existing email with a clear error.
- #13 enforces password rules in the client and server.
- #14 authenticates correct credentials.
- #15 restores a valid session after close/reopen.
- #16 invalidates the session and clears private UI state on logout.
- #18 redirects expired sessions to login.
- #91 returns consistent 401/403 responses for protected APIs.

New beta accounts receive a fixed starting allocation (recommended: 1,000 chips). Forgot password (#17) is deferred and must not be presented as working.

## Chips and league entry

- #68 uses one server-authoritative wallet balance everywhere.
- #2 provides the joinable-league carousel and a working Join Now action.
- #22 provides the complete joinable-league list.
- #3 blocks entry when balance is below the fee and shows required and available chips.

Joining must use one database transaction to create membership, debit the wallet, and add a ledger entry. An idempotency key prevents duplicate membership or double deduction. Failed enrollment must not deduct chips. For the beta, chips come only from the initial allocation or an administrator; rewards, purchases, boosters, coupons, cash prizes, and withdrawals are deferred.

## League and pick flow

- #21 opens the selected league.
- #24 displays accurate league information and the live server-derived countdown.
- #42 shows Take Action only for an active member with no submitted pick before lock.
- #45 blocks a previously used primary team on the server.
- #46 applies the same rule to the backup and prevents backup = primary.
- #47 displays both selections before confirmation.
- #48 changes the league/pick status to Submitted after success.
- #49 permits editing before lock and rejects it after lock on the server.
- #50 applies the no-pick-at-lock policy.
- #51 uses an authoritative UTC lock timestamp across time zones and DST.
- #52 makes submission idempotent under double taps and retries.
- #53 verifies the server result after a network failure instead of silently losing a pick.

Recommended beta policy for #50: no valid pick at gameweek lock means automatic elimination, recorded as `NO_PICK_SUBMITTED`.

## Fixtures and results

- #59 loads fixtures for the selected league.
- #62 displays kickoff times in the user's local timezone.
- #67 reflects postponed/rescheduled fixtures and adjusts applicable timers.
- #110 verifies synchronization of the live gameweek before kickoff.
- #79 evaluates the backup when the primary fails.
- #80 eliminates the user only when both applicable picks fail.
- #81 defines one gameweek-level UTC lock for simultaneous kickoffs in the beta.
- #82 makes the committed outcome stable across retries, refreshes, and relogins.

For a fixture postponed after lock, picks remain locked and the outcome stays pending until the fixture is resolved; the pick window is not silently reopened.

## Security and release readiness

- #89 is implemented as API/database authorization isolation for Drizzle/Neon rather than Supabase-specific RLS.
- #90 keeps the football-data API key server-side.
- #104 publishes and links Terms and Privacy.
- #109 runs the smoke path: fresh install -> signup -> chips -> join -> submit -> simulated result -> confirmed outcome.
- #111 confirms monitoring receives client and server failures.
- #112 documents and tests rollback.

## Explicitly deferred experiences

- Forgot-password recovery
- Action Center aggregation
- Chat, direct messages, opponent profiles, and comparisons
- Daily chip rewards, purchases, offers, boosters, and coupons
- Cash prizes, payout, KYC, and country eligibility
- Notifications
- Advanced statistics and history
- Broad performance, device, and accessibility certification

## Post-October 5 add-ons

### #113 — Operations admin portal for league chip economy management

Status: `0% — not implemented`. Priority: `High`. This task starts only after the approved October 5 scope has been completed and accepted; it is not part of the 38-task deadline commitment.

Acceptance scope:

- Authenticate and authorize a separate operations-admin role; Friends League `isAdmin` membership does not grant access.
- Configure competition entry fees for future cohorts and show when the value becomes effective.
- Keep a cohort's entry fee immutable after its first paid membership; later configuration changes affect only future cohorts.
- View each league's current vault balance, member payments, refunds, payouts, and reconciliation state.
- Search and filter the immutable chip ledger by user, league, transaction type, reference, and date.
- Make corrections only through reason-coded compensating ledger entries; never directly overwrite a user balance or league vault.
- Require confirmation for adjustments and record actor, reason, amount, affected user/league, timestamp, and resulting balance.
- Prevent duplicate adjustments with idempotency and enforce server-side limits and validation.
- Provide an audit-history view and CSV export suitable for reconciliation.
- Add authorization, concurrency, ledger-integrity, and end-to-end admin tests.
