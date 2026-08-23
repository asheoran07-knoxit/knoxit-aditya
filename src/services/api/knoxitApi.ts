import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import {
  allLeagues,
  chipBalance,
  dailyReward,
  myAdminLeagueRequests,
  publicFriendsLeagues
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
  canManageSettings: boolean;
  serverNow: string;
};

type MockArgs = string | { url: string; method?: string; body?: any };

async function mockBaseQuery(args: MockArgs) {
  const request = typeof args === "string" ? { url: args, method: "GET" } : args;
  await new Promise((resolve) => setTimeout(resolve, 80));

  if (request.url === "/api/session") {
    return { data: { user: { id: "demo-user", email: "demo@knoxit.local", username: "you" } } };
  }
  if (request.url === "/api/auth/login" || request.url === "/api/auth/signup") {
    return { data: { user: { id: "demo-user", email: request.body?.email, username: request.body?.username ?? "you" } } };
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
        currentPick: null,
        canTakeAction: true,
        canManageSettings: false,
        serverNow: new Date().toISOString(),
      } satisfies LeagueDetail,
    };
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
  useGetStandingsQuery
} = knoxitApi;
