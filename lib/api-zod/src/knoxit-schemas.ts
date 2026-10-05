// lib/api-zod/src/knoxit-schemas.ts
//
// Zod validation schemas for Knoxit's API. Drop into lib/api-zod alongside
// your other generated schemas. These are hand-written (not Orval-generated)
// since they cover new endpoints — once your OpenAPI spec is updated to
// match, regenerate via `pnpm --filter @workspace/api-spec run codegen`
// and these can be retired in favor of the generated versions.

import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[A-Za-z0-9_]+$/, "Use only letters, numbers, and underscores"),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10).max(128),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------

export const createLeagueSchema = z.object({
  name: z.string().min(3).max(60),
  sport: z.string().min(1),
  type: z.enum(["competitive", "friends"]),
  visibility: z.enum(["public", "invite_only"]),
  // Only meaningful for competitive leagues — Friends Leagues always get
  // entryFeeChips: 0 and maxMembers: null (uncapped), regardless of what's
  // sent here (see leagues.ts, which enforces this server-side).
  entryFeeChips: z.number().int().min(0).optional(),
  maxMembers: z.number().int().min(2).max(20).optional(),
  entryTerms: z.string().max(500).optional(), // free text, friends leagues only
  locksAt: z.string().datetime().optional(),
});
export type CreateLeagueInput = z.infer<typeof createLeagueSchema>;

export const createLeagueResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  inviteCode: z.string().nullable(), // present for friends leagues only
});
export type CreateLeagueResponse = z.infer<typeof createLeagueResponseSchema>;

export const joinByCodeSchema = z.object({
  inviteCode: z.string().min(4).max(12),
});
export type JoinByCodeInput = z.infer<typeof joinByCodeSchema>;

export const joinLeagueSchema = z.object({
  leagueId: z.string().uuid(),
});
export type JoinLeagueInput = z.infer<typeof joinLeagueSchema>;

export const joinCompetitionSchema = z.object({
  competitionKey: z.string().trim().min(1).max(40),
  startingRound: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});
export type JoinCompetitionInput = z.infer<typeof joinCompetitionSchema>;

export const leagueDetailResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  type: z.enum(["competitive", "friends"]),
  status: z.enum(["upcoming", "active", "completed", "split"]),
  currentGameweek: z.number().int(),
  locksAt: z.string().datetime().nullable(),
  vaultChips: z.number().int(),
  aliveCount: z.number().int(),
  joinedCount: z.number().int(),
  maxMembers: z.number().int().nullable(),
  memberStatus: z.enum(["alive", "knocked_out"]),
  currentPick: z.object({
    id: z.string().uuid(),
    primaryTeam: z.string(),
    backupTeam: z.string().nullable(),
    result: z.enum(["pending", "survived", "eliminated"]),
    submittedAt: z.string().datetime(),
  }).nullable(),
  canTakeAction: z.boolean(),
  canEditPick: z.boolean(),
  canManageSettings: z.boolean(),
  serverNow: z.string().datetime(),
});
export type LeagueDetailResponse = z.infer<typeof leagueDetailResponseSchema>;

// ---------------------------------------------------------------------------
// Friends League discovery + join requests
// ---------------------------------------------------------------------------

export const publicFriendsLeagueSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  creatorUsername: z.string(),
  memberCount: z.number().int(),
  entryTerms: z.string().nullable(),
  alreadyJoined: z.boolean(),
  hasPendingRequest: z.boolean(),
});
export type PublicFriendsLeague = z.infer<typeof publicFriendsLeagueSchema>;

export const requestToJoinSchema = z.object({
  leagueId: z.string().uuid(),
  message: z.string().max(200).optional(),
});
export type RequestToJoinInput = z.infer<typeof requestToJoinSchema>;

export const resolveJoinRequestSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approve", "decline"]),
});
export type ResolveJoinRequestInput = z.infer<typeof resolveJoinRequestSchema>;

// ---------------------------------------------------------------------------
// Picks
// ---------------------------------------------------------------------------

export const submitPickSchema = z.object({
  leagueId: z.string().uuid(),
  gameweek: z.number().int().min(1),
  primaryTeam: z.string().trim().min(1).max(100),
  backupTeam: z.string().trim().min(1).max(100).optional(),
}).refine((pick) => !pick.backupTeam || pick.backupTeam !== pick.primaryTeam, {
  message: "Backup pick must be different from primary pick",
  path: ["backupTeam"],
});
export type SubmitPickInput = z.infer<typeof submitPickSchema>;

export const pickResponseSchema = z.object({
  id: z.string().uuid(),
  leagueId: z.string().uuid(),
  gameweek: z.number().int(),
  primaryTeam: z.string(),
  backupTeam: z.string().nullable(),
  result: z.enum(["pending", "survived", "eliminated"]),
  usedBackup: z.boolean(),
});
export type PickResponse = z.infer<typeof pickResponseSchema>;

// ---------------------------------------------------------------------------
// Split vote
// ---------------------------------------------------------------------------

export const proposeSplitSchema = z.object({
  leagueId: z.string().uuid(),
});
export type ProposeSplitInput = z.infer<typeof proposeSplitSchema>;

export const castSplitVoteSchema = z.object({
  splitVoteId: z.string().uuid(),
  response: z.enum(["agreed", "declined"]),
});
export type CastSplitVoteInput = z.infer<typeof castSplitVoteSchema>;

export const splitVoteResponseSchema = z.object({
  id: z.string().uuid(),
  leagueId: z.string().uuid(),
  status: z.enum(["voting", "passed", "failed", "cancelled"]),
  vaultAtProposal: z.number().int(),
  responses: z.array(
    z.object({
      userId: z.string().uuid(),
      username: z.string(),
      response: z.enum(["pending", "agreed", "declined"]),
    })
  ),
});
export type SplitVoteResponse = z.infer<typeof splitVoteResponseSchema>;

// ---------------------------------------------------------------------------
// League chat
// ---------------------------------------------------------------------------

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(500),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  leagueId: z.string().uuid(),
  userId: z.string().uuid(),
  username: z.string(),
  content: z.string(),
  createdAt: z.string().datetime(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

// ---------------------------------------------------------------------------
// Chip ledger
// ---------------------------------------------------------------------------

export const chipTransactionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "signup_bonus",
    "daily_reward",
    "league_entry",
    "split_payout",
    "vault_payout",
    "chip_purchase",
    "shop_purchase",
    "admin_adjustment",
    "admin_credit",
    "admin_refund",
    "admin_correction",
  ]),
  amount: z.number().int(),
  balanceAfter: z.number().int(),
  vaultAmount: z.number().int(),
  note: z.string().nullable(),
  reference: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ChipTransaction = z.infer<typeof chipTransactionSchema>;
