// lib/db/schema.ts
//
// Drizzle ORM schema for Knoxit. Drop this into lib/db/src/schema.ts
// (or wherever your existing lib/db package keeps its schema) and run
// your migration generator (e.g. `drizzle-kit generate`) against it.
//
// Postgres is hosted on Neon and accessed through Drizzle ORM.

import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  primaryKey,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const leagueTypeEnum = pgEnum("league_type", ["competitive", "friends"]);
export const leagueVisibilityEnum = pgEnum("league_visibility", ["public", "invite_only"]);
export const leagueStatusEnum = pgEnum("league_status", ["upcoming", "active", "completed", "split"]);
export const memberStatusEnum = pgEnum("member_status", ["alive", "knocked_out"]);
export const pickResultEnum = pgEnum("pick_result", ["pending", "survived", "eliminated"]);
export const joinRequestStatusEnum = pgEnum("join_request_status", ["pending", "approved", "declined"]);
export const splitVoteStatusEnum = pgEnum("split_vote_status", ["voting", "passed", "failed", "cancelled"]);
export const splitResponseEnum = pgEnum("split_response", ["pending", "agreed", "declined"]);
export const chipTransactionTypeEnum = pgEnum("chip_transaction_type", [
  "signup_bonus",
  "daily_reward",
  "league_entry",
  "split_payout",
  "vault_payout",
  "chip_purchase",
  "shop_purchase",
  "referral_bonus",
  "admin_adjustment",
  "admin_credit",
  "admin_refund",
  "admin_correction",
]);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
// The users table owns both profile and credential data. Passwords are stored
// only as scrypt hashes; browser sessions live in auth_sessions below.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  username: text("username").notNull().unique(),
  chipBalance: integer("chip_balance").notNull().default(0),
  // Refer & Earn (25 Jul 2026) — every user gets a unique shareable code;
  // referredByUserId tracks who brought them in, for reward attribution.
  referralCode: text("referral_code").notNull().unique(),
  referredByUserId: uuid("referred_by_user_id"),
  isOperationsAdmin: boolean("is_operations_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Opaque browser sessions. Only a SHA-256 digest is stored, so a database
// leak does not expose usable session cookies.
export const authSessions = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("auth_sessions_user_id_idx").on(table.userId),
    expiresAtIdx: index("auth_sessions_expires_at_idx").on(table.expiresAt),
  })
);

// ---------------------------------------------------------------------------
// Notification preferences — one row per user, simple booleans. Add more
// columns here as new notification types are introduced rather than a
// separate table per type.
// ---------------------------------------------------------------------------

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  pickLockReminders: boolean("pick_lock_reminders").notNull().default(true),
  resultAlerts: boolean("result_alerts").notNull().default(true),
  chatMessages: boolean("chat_messages").notNull().default(true),
  friendsLeagueRequests: boolean("friends_league_requests").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Provider-backed football data. The browser reads these cached Neon rows;
// only the server-side sync process talks to football-data.org.
// ---------------------------------------------------------------------------

export const footballCompetitions = pgTable("football_competitions", {
  key: text("key").primaryKey(),
  providerCode: text("provider_code").notNull().unique(),
  name: text("name").notNull(),
  emblem: text("emblem"),
  seasonStartYear: integer("season_start_year"),
  currentMatchday: integer("current_matchday"),
  // Product settings live beside provider metadata so fixture syncs can
  // update the season without changing how Knoxit runs its survivor pools.
  competitiveEntryFeeChips: integer("competitive_entry_fee_chips").notNull().default(0),
  competitiveMaxMembers: integer("competitive_max_members").notNull().default(20),
  competitiveEnabled: boolean("competitive_enabled").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const footballFixtures = pgTable(
  "football_fixtures",
  {
    providerId: integer("provider_id").primaryKey(),
    competitionKey: text("competition_key").notNull().references(() => footballCompetitions.key, { onDelete: "cascade" }),
    seasonStartYear: integer("season_start_year"),
    matchday: integer("matchday"),
    stage: text("stage"),
    group: text("group_name"),
    utcDate: timestamp("utc_date", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    venue: text("venue"),
    homeTeamId: integer("home_team_id"),
    homeTeamName: text("home_team_name").notNull(),
    homeTeamShortName: text("home_team_short_name"),
    homeTeamCrest: text("home_team_crest"),
    awayTeamId: integer("away_team_id"),
    awayTeamName: text("away_team_name").notNull(),
    awayTeamShortName: text("away_team_short_name"),
    awayTeamCrest: text("away_team_crest"),
    winner: text("winner"),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    providerUpdatedAt: timestamp("provider_updated_at", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    competitionDateIdx: index("football_fixtures_competition_date_idx").on(table.competitionKey, table.utcDate),
    competitionMatchdayIdx: index("football_fixtures_competition_matchday_idx").on(table.competitionKey, table.matchday),
    statusIdx: index("football_fixtures_status_idx").on(table.status),
  })
);

export const footballStandings = pgTable(
  "football_standings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionKey: text("competition_key").notNull().references(() => footballCompetitions.key, { onDelete: "cascade" }),
    seasonStartYear: integer("season_start_year").notNull(),
    stage: text("stage").notNull(),
    type: text("type").notNull(),
    group: text("group_name"),
    position: integer("position").notNull(),
    teamId: integer("team_id").notNull(),
    teamName: text("team_name").notNull(),
    teamShortName: text("team_short_name"),
    teamCrest: text("team_crest"),
    playedGames: integer("played_games").notNull(),
    form: text("form"),
    won: integer("won").notNull(),
    draw: integer("draw").notNull(),
    lost: integer("lost").notNull(),
    points: integer("points").notNull(),
    goalsFor: integer("goals_for").notNull(),
    goalsAgainst: integer("goals_against").notNull(),
    goalDifference: integer("goal_difference").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueStanding: uniqueIndex("football_standings_unique_row").on(
      table.competitionKey,
      table.seasonStartYear,
      table.stage,
      table.type,
      table.teamId
    ),
    competitionPositionIdx: index("football_standings_competition_position_idx").on(table.competitionKey, table.position),
  })
);

// ---------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------

export const leagues = pgTable("leagues", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // display code, e.g. "PL-1", "WW-1"
  name: text("name").notNull(), // uniqueness enforced for friends leagues via partial index below
  sport: text("sport").notNull(), // e.g. "premier_league", "la_liga"
  type: leagueTypeEnum("type").notNull().default("competitive"),
  visibility: leagueVisibilityEnum("visibility").notNull().default("public"),
  status: leagueStatusEnum("status").notNull().default("upcoming"),

  createdBy: uuid("created_by").references(() => users.id),

  // Competitive leagues are automatically-created cohorts for one real
  // competition, season and starting round. Friends Leagues leave these
  // fields null. `instanceNumber` is the user-invisible PL-1/PL-2 split.
  competitionKey: text("competition_key").references(() => footballCompetitions.key),
  seasonStartYear: integer("season_start_year"),
  startingRound: integer("starting_round"),
  instanceNumber: integer("instance_number"),

  // Chip economy — entry fee is always chip-denominated this season.
  // Friends Leagues have NEITHER an entry fee nor a vault (25 Jul 2026
  // decision) — any prize arrangement is described in `entryTerms` and
  // handled entirely off-platform. These columns stay 0 for friends
  // leagues; only competitive leagues use them.
  entryFeeChips: integer("entry_fee_chips").notNull().default(0),
  vaultChips: integer("vault_chips").notNull().default(0), // grows per joiner, fixed once locked

  // Nullable = no cap. Friends Leagues are always uncapped (25 Jul 2026
  // decision: "anyone around can join"); competitive leagues set this to
  // a real number (typically 20).
  maxMembers: integer("max_members"),
  currentGameweek: integer("current_gameweek").notNull().default(1),
  locksAt: timestamp("locks_at", { withTimezone: true }),

  // Friends League specific — free text the creator writes describing any
  // off-platform arrangement. Knoxit never parses or acts on this value;
  // it is stored and displayed verbatim only.
  entryTerms: text("entry_terms"),

  // Friends League specific — random, non-guessable code for direct instant
  // join (25 Jul 2026 decision: entering a valid code joins immediately,
  // no creator approval needed — distinct from the public request-to-join
  // flow, which still requires approval). Null for competitive leagues.
  inviteCode: text("invite_code").unique(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  friendsNameUnique: uniqueIndex("friends_league_name_unique")
    .on(sql`lower(${table.name})`)
    .where(sql`${table.type} = 'friends'`),
  competitiveCohortUnique: uniqueIndex("competitive_league_cohort_unique")
    .on(table.competitionKey, table.seasonStartYear, table.startingRound, table.instanceNumber)
    .where(sql`${table.type} = 'competitive'`),
  competitiveCohortLookup: index("competitive_league_cohort_lookup_idx")
    .on(table.competitionKey, table.seasonStartYear, table.startingRound, table.status),
}));

// NOTE ON NAME UNIQUENESS (25 Jul 2026 decision):
// Friends League names must be unique (case-insensitive) so two public
// leagues can't confusingly share a name. This does NOT apply to
// competitive leagues, which intentionally reuse the same base name across
// many concurrent instances (e.g. "Premier League Survivor" #1, #2, #3 —
// distinguished by `code`, not `name`). Enforce with a partial unique index
// in your migration, since Drizzle's schema builder doesn't yet support
// partial indexes directly:
//
//   CREATE UNIQUE INDEX friends_league_name_unique
//     ON leagues (lower(name))
//     WHERE type = 'friends';
//
// The application layer also checks this before insert (see leagues.ts)
// to return a friendly error instead of a raw DB constraint violation —
// but keep the DB-level index too, as the actual source of truth in case
// of concurrent creates.

// ---------------------------------------------------------------------------
// League membership
// ---------------------------------------------------------------------------

export const leagueMembers = pgTable(
  "league_members",
  {
    leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: memberStatusEnum("status").notNull().default("alive"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    knockedOutAtGameweek: integer("knocked_out_at_gameweek"),
    knockoutReason: text("knockout_reason"),
    // A client-generated UUID makes a retried join safe while still allowing
    // a deliberate second entry into another cohort with a fresh UUID.
    joinRequestKey: text("join_request_key"),

    // Friends League co-admin delegation (25 Jul 2026 decision): the
    // original creator can promote trusted members to also approve/decline
    // join requests, so approvals don't bottleneck on one person. Scoped
    // narrowly on purpose — admins can only resolve join requests, nothing
    // else (can't delete the league, remove the creator, edit settings,
    // etc.). Only `leagues.createdBy` can grant/revoke this flag.
    isAdmin: boolean("is_admin").notNull().default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.leagueId, table.userId] }),
    joinRequestUnique: uniqueIndex("league_member_join_request_unique")
      .on(table.userId, table.joinRequestKey)
      .where(sql`${table.joinRequestKey} is not null`),
  })
);

// ---------------------------------------------------------------------------
// Picks
// ---------------------------------------------------------------------------

export const picks = pgTable(
  "picks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    gameweek: integer("gameweek").notNull(),

    primaryTeam: text("primary_team").notNull(),
    backupTeam: text("backup_team"),

    result: pickResultEnum("result").notNull().default("pending"),
    usedBackup: boolean("used_backup").notNull().default(false),

    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    onePickPerGameweek: uniqueIndex("picks_user_league_gameweek_unique")
      .on(table.userId, table.leagueId, table.gameweek),
  })
);

// A team, once picked by a user in a league, can't be picked again by that
// user until the pool resets. Enforce this at the query layer (see
// picks.ts routes) rather than a DB constraint, since the "reset once all
// teams used" rule needs application logic to detect exhaustion.

// ---------------------------------------------------------------------------
// Friends League join requests
// ---------------------------------------------------------------------------

export const joinRequests = pgTable("join_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  requesterId: uuid("requester_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: joinRequestStatusEnum("status").notNull().default("pending"),
  // Optional note from the requester (25 Jul 2026 decision) — e.g. "I'm in,
  // ready to send my share." Free text, same treatment as entryTerms: shown
  // verbatim to the creator/admins, never parsed or acted on by the app.
  message: text("message"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Split votes
// ---------------------------------------------------------------------------

export const splitVotes = pgTable("split_votes", {
  id: uuid("id").primaryKey().defaultRandom(),
  leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  gameweek: integer("gameweek").notNull(),
  proposedBy: uuid("proposed_by").notNull().references(() => users.id),
  status: splitVoteStatusEnum("status").notNull().default("voting"),
  vaultAtProposal: integer("vault_at_proposal").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const splitVoteResponses = pgTable(
  "split_vote_responses",
  {
    splitVoteId: uuid("split_vote_id").notNull().references(() => splitVotes.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    response: splitResponseEnum("response").notNull().default("pending"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.splitVoteId, table.userId] }),
  })
);

// ---------------------------------------------------------------------------
// League chat history. Live delivery will be owned by the Express service
// through WebSocket or SSE rather than a database-vendor client subscription.
// ---------------------------------------------------------------------------

export const leagueMessages = pgTable("league_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leagueMessagesRelations = relations(leagueMessages, ({ one }) => ({
  league: one(leagues, { fields: [leagueMessages.leagueId], references: [leagues.id] }),
  user: one(users, { fields: [leagueMessages.userId], references: [users.id] }),
}));

// ---------------------------------------------------------------------------
// Active boosters — for boosters tied to a SPECIFIC pick/gameweek rather
// than a generic inventory item. Draw Shield is the first of these: buying
// it isn't enough, it has to be activated for one particular league +
// gameweek before that pick locks, so resolvePick() knows to check for it.
// ---------------------------------------------------------------------------

export const boosterTypeEnum = pgEnum("booster_type", ["draw_shield", "team_recall", "league_pulse"]);

export const activeBoosters = pgTable("active_boosters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "cascade" }),
  gameweek: integer("gameweek").notNull(),
  boosterType: boosterTypeEnum("booster_type").notNull(),
  // Only used by team_recall — which team it's letting the user re-pick.
  // Null for booster types (like draw_shield) that don't need this.
  team: text("team"),
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }), // set once resolvePick/picks actually uses it
});

// ---------------------------------------------------------------------------
// Ad-reward progress — alternative acquisition path for shop items (25 Jul
// 2026 decision): watch N rewarded ads instead of paying chips. Tracked
// per user per item since different items need different ad counts. See
// shop.ts for the actual watch-ad endpoint and the critical note about
// server-side ad-completion verification.
// ---------------------------------------------------------------------------

export const adRewardProgress = pgTable("ad_reward_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(), // matches SHOP_ITEMS keys in shop.ts
  viewsCompleted: integer("views_completed").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Chip ledger — every chip movement is recorded here, never mutated in place
// ---------------------------------------------------------------------------

export const chipLedger = pgTable("chip_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leagueId: uuid("league_id").references(() => leagues.id), // nullable — not all entries are league-related
  type: chipTransactionTypeEnum("type").notNull(),
  amount: integer("amount").notNull(), // positive = credit, negative = debit
  balanceAfter: integer("balance_after").notNull(),
  vaultAmount: integer("vault_amount").notNull().default(0),
  note: text("note"),
  reference: text("reference"),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  idempotencyUnique: uniqueIndex("chip_ledger_idempotency_unique")
    .on(table.idempotencyKey)
    .where(sql`${table.idempotencyKey} is not null`),
  userCreatedIdx: index("chip_ledger_user_created_idx").on(table.userId, table.createdAt),
  leagueCreatedIdx: index("chip_ledger_league_created_idx").on(table.leagueId, table.createdAt),
}));

export const operationsAuditLog = pgTable("operations_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  reason: text("reason").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  createdAtIdx: index("operations_audit_log_created_idx").on(table.createdAt),
  entityIdx: index("operations_audit_log_entity_idx").on(table.entityType, table.entityId),
}));

// Vault-only corrections are kept separate from the per-user chip ledger.
// Setting a target balance therefore remains an auditable delta operation,
// never an unexplained overwrite.
export const leagueVaultLedger = pgTable("league_vault_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  leagueId: uuid("league_id").notNull().references(() => leagues.id, { onDelete: "restrict" }),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  action: text("action").notNull(),
  reference: text("reference").notNull(),
  reason: text("reason").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  leagueCreatedIdx: index("league_vault_ledger_league_created_idx").on(table.leagueId, table.createdAt),
}));

// ---------------------------------------------------------------------------
// Relations (for Drizzle's relational query API)
// ---------------------------------------------------------------------------

export const leaguesRelations = relations(leagues, ({ many, one }) => ({
  members: many(leagueMembers),
  picks: many(picks),
  joinRequests: many(joinRequests),
  splitVotes: many(splitVotes),
  creator: one(users, { fields: [leagues.createdBy], references: [users.id] }),
  competition: one(footballCompetitions, { fields: [leagues.competitionKey], references: [footballCompetitions.key] }),
}));

export const leagueMembersRelations = relations(leagueMembers, ({ one }) => ({
  league: one(leagues, { fields: [leagueMembers.leagueId], references: [leagues.id] }),
  user: one(users, { fields: [leagueMembers.userId], references: [users.id] }),
}));

export const picksRelations = relations(picks, ({ one }) => ({
  league: one(leagues, { fields: [picks.leagueId], references: [leagues.id] }),
  user: one(users, { fields: [picks.userId], references: [users.id] }),
}));

export const splitVotesRelations = relations(splitVotes, ({ one, many }) => ({
  league: one(leagues, { fields: [splitVotes.leagueId], references: [leagues.id] }),
  proposer: one(users, { fields: [splitVotes.proposedBy], references: [users.id] }),
  responses: many(splitVoteResponses),
}));

export const splitVoteResponsesRelations = relations(splitVoteResponses, ({ one }) => ({
  splitVote: one(splitVotes, { fields: [splitVoteResponses.splitVoteId], references: [splitVotes.id] }),
  user: one(users, { fields: [splitVoteResponses.userId], references: [users.id] }),
}));
