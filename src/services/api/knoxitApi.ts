import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import {
  allLeagues,
  chipBalance,
  dailyReward,
  myAdminLeagueRequests,
  publicFriendsLeagues,
  teamPool
} from "../../lib/mockData";
import { resolveApiBaseUrl } from "./baseUrl";

// Keep browser requests on the app origin by default. Vite proxies /api during
// development and the Vercel function does the same in production. Apart from
// avoiding third-party-cookie restrictions, this also prevents a phone opened
// against the laptop's dev server from treating "localhost" as the phone.
const apiBaseUrl = resolveApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL,
  window.location.origin
);
const useMockApi = import.meta.env.VITE_USE_MOCK_API === "true";

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  isOperationsAdmin: boolean;
};

export type FootballCompetition = {
  key: string;
  providerCode: string;
  name: string;
  shortLabel?: string;
  emblem: string | null;
  seasonStartYear: number | null;
  currentMatchday: number | null;
  lastSyncedAt: string | null;
};

export type FootballFixture = {
  providerId: number;
  competitionKey: string;
  seasonStartYear: number | null;
  matchday: number | null;
  stage: string | null;
  group: string | null;
  utcDate: string;
  status: string;
  venue: string | null;
  homeTeamId: number | null;
  homeTeamName: string;
  homeTeamShortName: string | null;
  homeTeamCrest: string | null;
  awayTeamId: number | null;
  awayTeamName: string;
  awayTeamShortName: string | null;
  awayTeamCrest: string | null;
  winner: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type FootballStanding = {
  id: string;
  group: string | null;
  position: number;
  teamId: number;
  teamName: string;
  teamShortName: string | null;
  teamCrest: string | null;
  playedGames: number;
  form: string[];
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalDifference: number;
};

export type CompetitiveLeagueCard = {
  competitionKey: string;
  name: string;
  emblem: string | null;
  seasonStartYear: number | null;
  startingRound: number | null;
  locksAt: string | null;
  entryFeeChips: number;
  maxMembersPerCohort: number;
  joinedEntries: number;
  available: boolean;
  unavailableReason: string | null;
};

export type MyLeague = {
  id: string;
  code: string;
  name: string;
  type: "competitive" | "friends";
  status: "upcoming" | "active" | "completed" | "split";
  competitionKey: string | null;
  currentGameweek: number;
  startingRound: number | null;
  locksAt: string | null;
  vaultChips: number;
  maxMembers: number | null;
  memberStatus: "alive" | "knocked_out";
};

export type JoinCompetitionResponse = {
  joined: true;
  replayed: boolean;
  balanceAfter?: number;
  league: {
    id: string;
    code: string;
    name: string;
    competitionKey: string;
    seasonStartYear: number;
    startingRound: number;
    instanceNumber: number;
    locksAt: string;
  };
};

export type LeagueDetail = {
  id: string;
  code: string;
  name: string;
  type: "competitive" | "friends";
  status: "upcoming" | "active" | "completed" | "split";
  currentGameweek: number;
  locksAt: string | null;
  vaultChips: number;
  aliveCount: number;
  joinedCount: number;
  maxMembers: number | null;
  memberStatus: "alive" | "knocked_out";
  currentPick: {
    id: string;
    primaryTeam: string;
    backupTeam: string | null;
    result: "pending" | "survived" | "eliminated";
    submittedAt: string;
  } | null;
  canTakeAction: boolean;
  canEditPick: boolean;
  canManageSettings: boolean;
  serverNow: string;
};

export type PickRecord = {
  id: string;
  leagueId: string;
  userId: string;
  gameweek: number;
  primaryTeam: string;
  backupTeam: string | null;
  result: "pending" | "survived" | "eliminated";
  usedBackup: boolean;
  submittedAt: string;
};

export type PickOptions = {
  leagueId: string;
  gameweek: number;
  locksAt: string | null;
  serverNow: string;
  teams: Array<{
    id: number | null;
    name: string;
    shortName: string | null;
    crest: string | null;
    used: boolean;
  }>;
  currentPick: PickRecord | null;
  canSubmit: boolean;
  canEdit: boolean;
};

export type SubmitPickResponse = {
  pick: PickRecord;
  replayed: boolean;
  updated: boolean;
};

export type OperationsSummary = {
  competitions: Array<{
    key: string;
    name: string;
    entryFeeChips: number;
    enabled: boolean;
    lastSyncedAt: string;
  }>;
  leagues: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    entryFeeChips: number;
    vaultChips: number;
    memberCount: number;
    entryPayments: number;
    refunds: number;
    payouts: number;
    reconciled: boolean;
  }>;
};

export type OperationsLedgerRow = {
  id: string;
  userId: string;
  username: string;
  leagueId: string | null;
  leagueCode: string | null;
  type: string;
  amount: number;
  balanceAfter: number;
  vaultAmount: number;
  reference: string | null;
  note: string | null;
  actorUserId: string | null;
  createdAt: string;
};

const mockPicks = new Map<string, PickRecord>();

type MockArgs = string | { url: string; method?: string; body?: any };

async function mockBaseQuery(args: MockArgs) {
  const request = typeof args === "string" ? { url: args, method: "GET" } : args;
  await new Promise((resolve) => setTimeout(resolve, 80));

  if (request.url === "/api/session") {
    return { data: { user: { id: "demo-user", email: "demo@knoxit.local", username: "you", isOperationsAdmin: true } } };
  }
  if (request.url === "/api/auth/login" || request.url === "/api/auth/signup") {
    return { data: { user: { id: "demo-user", email: request.body?.email, username: request.body?.username ?? "you", isOperationsAdmin: true } } };
  }
  if (request.url === "/api/auth/logout") return { data: undefined };
  if (request.url === "/api/leagues/mine") return { data: [] };
  if (request.url === "/api/leagues/competitions") {
    return {
      data: allLeagues.slice(0, 5).map((league, index) => ({
        competitionKey: ["epl", "la_liga", "bundesliga", "ucl", "serie_a"][index],
        name: league.name.replace(" Survivor", ""),
        emblem: null,
        seasonStartYear: 2026,
        startingRound: Number(league.gw.replace(/\D/g, "")) || 1,
        locksAt: new Date(Date.now() + (index + 2) * 60 * 60 * 1000).toISOString(),
        entryFeeChips: 0,
        maxMembersPerCohort: 20,
        joinedEntries: league.joined,
        available: true,
        unavailableReason: null
      }))
    };
  }
  if (request.url === "/api/leagues/join-competition" && request.method === "POST") {
    return {
      data: {
        joined: true,
        replayed: false,
        league: {
          id: crypto.randomUUID(),
          code: "DEMO-1",
          name: "Demo Survivor",
          competitionKey: request.body.competitionKey,
          seasonStartYear: 2026,
          startingRound: request.body.startingRound,
          instanceNumber: 1,
          locksAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        }
      }
    };
  }
  if (request.url.startsWith("/api/leagues/") && (!request.method || request.method === "GET")) {
    const id = request.url.slice("/api/leagues/".length);
    const currentPick = mockPicks.get(id) ?? null;
    return {
      data: {
        id,
        code: "DEMO-1",
        name: "Demo Survivor",
        type: "competitive",
        status: "upcoming",
        currentGameweek: 1,
        locksAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        vaultChips: 0,
        aliveCount: 1,
        joinedCount: 1,
        maxMembers: 20,
        memberStatus: "alive",
        currentPick,
        canTakeAction: currentPick === null,
        canEditPick: currentPick !== null,
        canManageSettings: false,
        serverNow: new Date().toISOString(),
      } satisfies LeagueDetail,
    };
  }
  if (request.url.startsWith("/api/picks/available-teams/") && (!request.method || request.method === "GET")) {
    const leagueId = request.url.slice("/api/picks/available-teams/".length);
    return {
      data: {
        leagueId,
        gameweek: 1,
        locksAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        serverNow: new Date().toISOString(),
        teams: teamPool.map((name, index) => ({ id: index + 1, name, shortName: name, crest: null, used: false })),
        currentPick: mockPicks.get(leagueId) ?? null,
        canSubmit: true,
        canEdit: mockPicks.has(leagueId),
      } satisfies PickOptions,
    };
  }
  if (request.url === "/api/picks" && request.method === "POST") {
    const existing = mockPicks.get(request.body.leagueId);
    const pick: PickRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      userId: "demo-user",
      leagueId: request.body.leagueId,
      gameweek: request.body.gameweek,
      primaryTeam: request.body.primaryTeam,
      backupTeam: request.body.backupTeam ?? null,
      result: "pending",
      usedBackup: false,
      submittedAt: new Date().toISOString(),
    };
    mockPicks.set(request.body.leagueId, pick);
    return { data: { pick, replayed: false, updated: Boolean(existing) } satisfies SubmitPickResponse };
  }
  if (request.url === "/api/friends-leagues/public") return { data: publicFriendsLeagues };
  if (request.url === "/api/friends-leagues/requests/mine") return { data: myAdminLeagueRequests };
  if (request.url === "/api/shop/balance") return { data: { balance: chipBalance } };
  if (request.url === "/api/shop/daily-reward") return { data: dailyReward };
  if (request.method && request.method !== "GET") return { data: { ok: true, ...request.body } };

  return { error: { status: 404, data: { error: "Mock endpoint not implemented" } } };
}

export const knoxitApi = createApi({
  reducerPath: "knoxitApi",
  baseQuery: useMockApi
    ? mockBaseQuery
    : fetchBaseQuery({
        baseUrl: apiBaseUrl,
        credentials: "include"
      }),
  tagTypes: [
    "Session",
    "League",
    "FriendsLeague",
    "JoinRequest",
    "Pick",
    "Fixture",
    "Shop",
    "Notification",
    "Referral",
    "Chat",
    "SplitVote"
    ,"Operations"
  ],
  endpoints: (builder) => ({
    getSession: builder.query<{ user: SessionUser | null }, void>({
      query: () => "/api/session",
      providesTags: ["Session"]
    }),
    login: builder.mutation<{ user: SessionUser }, { email: string; password: string }>({
      query: (body) => ({ url: "/api/auth/login", method: "POST", body }),
      invalidatesTags: ["Session"]
    }),
    signup: builder.mutation<{ user: SessionUser; balance: number }, { username: string; email: string; password: string }>({
      query: (body) => ({ url: "/api/auth/signup", method: "POST", body }),
      invalidatesTags: ["Session"]
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: "/api/auth/logout", method: "POST" }),
      invalidatesTags: ["Session"]
    }),
    getLeagues: builder.query<MyLeague[], void>({
      query: () => "/api/leagues/mine",
      providesTags: ["League"]
    }),
    getLeagueDetail: builder.query<LeagueDetail, string>({
      query: (id) => `/api/leagues/${encodeURIComponent(id)}`,
      providesTags: (_result, _error, id) => [{ type: "League", id }]
    }),
    joinLeague: builder.mutation<{ joined: boolean }, string>({
      query: (id) => ({ url: `/api/leagues/${id}/join`, method: "POST" }),
      invalidatesTags: ["League", "Shop"]
    }),
    getCompetitiveLeagues: builder.query<CompetitiveLeagueCard[], void>({
      query: () => "/api/leagues/competitions",
      providesTags: ["League"]
    }),
    joinCompetition: builder.mutation<JoinCompetitionResponse, {
      competitionKey: string;
      startingRound: number;
      idempotencyKey: string;
    }>({
      query: (body) => ({ url: "/api/leagues/join-competition", method: "POST", body }),
      invalidatesTags: ["League", "Shop"]
    }),
    getPublicFriendsLeagues: builder.query<any[], void>({
      query: () => "/api/friends-leagues/public",
      providesTags: ["FriendsLeague"]
    }),
    requestFriendsLeague: builder.mutation<any, { leagueId: string; message?: string }>({
      query: ({ leagueId, message }) => ({
        url: `/api/friends-leagues/${leagueId}/request`,
        method: "POST",
        body: { message }
      }),
      invalidatesTags: ["FriendsLeague", "JoinRequest"]
    }),
    joinByCode: builder.mutation<any, { inviteCode: string }>({
      query: (body) => ({ url: "/api/friends-leagues/join-by-code", method: "POST", body }),
      invalidatesTags: ["FriendsLeague", "League"]
    }),
    getChipBalance: builder.query<{ balance: number }, void>({
      query: () => "/api/shop/balance",
      providesTags: ["Shop"]
    }),
    getFootballCompetitions: builder.query<FootballCompetition[], void>({
      query: () => "/api/fixtures/competitions",
      providesTags: ["Fixture"]
    }),
    getFixtures: builder.query<{ competitions: FootballCompetition[]; fixtures: FootballFixture[] }, { league: string }>({
      query: ({ league }) => `/api/fixtures?league=${encodeURIComponent(league)}`,
      providesTags: ["Fixture"]
    }),
    getStandings: builder.query<{ competition: FootballCompetition; standings: FootballStanding[] }, string>({
      query: (league) => `/api/standings/${encodeURIComponent(league)}`,
      providesTags: ["Fixture"]
    }),
    getPickOptions: builder.query<PickOptions, string>({
      query: (leagueId) => `/api/picks/available-teams/${encodeURIComponent(leagueId)}`,
      providesTags: (_result, _error, leagueId) => [{ type: "Pick", id: leagueId }]
    }),
    submitPick: builder.mutation<SubmitPickResponse, {
      leagueId: string;
      gameweek: number;
      primaryTeam: string;
      backupTeam?: string;
    }>({
      query: (body) => ({ url: "/api/picks", method: "POST", body }),
      invalidatesTags: (_result, _error, input) => [
        { type: "Pick", id: input.leagueId },
        { type: "League", id: input.leagueId },
      ]
    }),
    getOperationsSummary: builder.query<OperationsSummary, void>({
      query: () => "/api/operations/summary",
      providesTags: ["Operations"]
    }),
    getOperationsLedger: builder.query<{ rows: OperationsLedgerRow[]; page: number; pageSize: number; total: number }, string | void>({
      query: (queryString) => `/api/operations/ledger${queryString ? `?${queryString}` : ""}`,
      providesTags: ["Operations"]
    }),
    getOperationsAudit: builder.query<any[], void>({
      query: () => "/api/operations/audit",
      providesTags: ["Operations"]
    }),
    updateCompetitionEntryFee: builder.mutation<any, { key: string; entryFeeChips: number; reason: string; idempotencyKey: string }>({
      query: ({ key, ...body }) => ({
        url: `/api/operations/competitions/${encodeURIComponent(key)}/entry-fee`,
        method: "PATCH",
        body
      }),
      invalidatesTags: ["Operations", "League"]
    }),
    createOperationsAdjustment: builder.mutation<any, {
      kind: "credit" | "refund" | "correction";
      userId: string;
      leagueId?: string;
      amount: number;
      vaultAmount: number;
      reference: string;
      reason: string;
      idempotencyKey: string;
    }>({
      query: (body) => ({ url: "/api/operations/adjustments", method: "POST", body }),
      invalidatesTags: ["Operations", "Shop", "League"]
    })
  })
});

export const {
  useGetSessionQuery,
  useLoginMutation,
  useSignupMutation,
  useLogoutMutation,
  useGetLeaguesQuery,
  useGetLeagueDetailQuery,
  useJoinLeagueMutation,
  useGetCompetitiveLeaguesQuery,
  useJoinCompetitionMutation,
  useGetPublicFriendsLeaguesQuery,
  useRequestFriendsLeagueMutation,
  useJoinByCodeMutation,
  useGetChipBalanceQuery,
  useGetFootballCompetitionsQuery,
  useGetFixturesQuery,
  useGetStandingsQuery,
  useGetPickOptionsQuery,
  useSubmitPickMutation,
  useGetOperationsSummaryQuery,
  useGetOperationsLedgerQuery,
  useGetOperationsAuditQuery,
  useUpdateCompetitionEntryFeeMutation,
  useCreateOperationsAdjustmentMutation
} = knoxitApi;
