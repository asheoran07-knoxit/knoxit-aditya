// artifacts/knoxit/src/pages/Home.tsx
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Shield, Clock, Radio, Coins, ChevronRight, ChevronRightCircle, Plus, KeyRound, Target, Calendar, Gift,
} from "lucide-react";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";
import { normalizeApiError } from "../services/api/error";
import {
  type CompetitiveLeagueCard,
  type MyLeague,
  useGetChipBalanceQuery,
  useGetCompetitiveLeaguesQuery,
  useGetLeaguesQuery,
  useGetMyJoinRequestsQuery,
  useGetPickDashboardQuery,
  useJoinCompetitionMutation,
} from "../services/api/knoxitApi";
import { groupPickDashboard, lockCountdown } from "../features/picks/pickDashboard";

function isOngoing(league: MyLeague) {
  return league.memberStatus === "alive" && league.status !== "completed" && league.status !== "split";
}

function leagueStatusLabel(league: MyLeague, now: number) {
  if (league.memberStatus === "knocked_out") return { text: "KNOCKED OUT", color: "text-red-400" };
  if (league.status === "completed") return { text: "COMPLETED", color: "text-zinc-400" };
  if (league.status === "split") return { text: "VAULT SPLIT", color: "text-amber-400" };
  const countdown = lockCountdown(league.locksAt, now);
  if (countdown === "Not scheduled" || countdown === "Locked") {
    return { text: league.status === "active" ? "IN PROGRESS" : "UPCOMING", color: "text-emerald-400" };
  }
  return { text: `LOCKS IN ${countdown}`, color: "text-emerald-400" };
}

function competitionInitials(name: string) {
  return name.split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function lockLabel(locksAt: string | null, now: number) {
  if (!locksAt) return "Not open";
  const milliseconds = new Date(locksAt).getTime() - now;
  if (milliseconds <= 0) return "Locked";
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 60) return `Locks in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Locks in ${hours}h ${minutes % 60}m`;
  return `Locks in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export default function Home() {
  const [, setLocation] = useLocation();
  const competitionsQuery = useGetCompetitiveLeaguesQuery();
  const balanceQuery = useGetChipBalanceQuery();
  const leaguesQuery = useGetLeaguesQuery();
  const pickDashboardQuery = useGetPickDashboardQuery();
  const requestsQuery = useGetMyJoinRequestsQuery();
  const [joinCompetition, joinState] = useJoinCompetitionMutation();
  const [joiningKey, setJoiningKey] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const joinRequestKeys = useRef(new Map<string, string>());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const join = async (competition: CompetitiveLeagueCard) => {
    if (!competition.available || competition.startingRound === null) return;
    setJoinError(null);
    setJoiningKey(competition.competitionKey);
    const requestKey = joinRequestKeys.current.get(competition.competitionKey) ?? crypto.randomUUID();
    joinRequestKeys.current.set(competition.competitionKey, requestKey);

    try {
      const result = await joinCompetition({
        competitionKey: competition.competitionKey,
        startingRound: competition.startingRound,
        idempotencyKey: requestKey,
      }).unwrap();
      joinRequestKeys.current.delete(competition.competitionKey);
      setLocation(`/leagues/${result.league.id}`);
    } catch (requestError) {
      const normalized = normalizeApiError(requestError);
      if (typeof normalized.status === "number" && normalized.status < 500) {
        joinRequestKeys.current.delete(competition.competitionKey);
      }
      setJoinError(normalized.message);
    } finally {
      setJoiningKey(null);
    }
  };

  const myLeagues = leaguesQuery.data ?? [];
  const friendsLeagues = myLeagues.filter((league) => league.type === "friends");
  const ongoingLeagues = myLeagues.filter(isOngoing);
  const pickGroups = groupPickDashboard(pickDashboardQuery.data?.items ?? []);
  const nextLock = pickGroups.lockingSoon[0]?.locksAt ?? null;
  const pendingRequests = requestsQuery.data?.length ?? 0;
  const loadingValue = "…";

  const dashboardStats = [
    {
      icon: Shield,
      value: leaguesQuery.isSuccess ? String(ongoingLeagues.length) : loadingValue,
      label: "Active Leagues",
      sub: ongoingLeagues.length > 0 ? "You're still alive!" : "Join one to start",
      subColor: "text-zinc-500",
      accent: "emerald",
    },
    {
      icon: Clock,
      value: pickDashboardQuery.isSuccess ? String(pickGroups.lockingSoon.length) : loadingValue,
      label: "Locking Soon",
      sub: nextLock ? `Next: ${lockCountdown(nextLock, now)}` : "Nothing due",
      subColor: "text-amber-400",
      accent: "amber",
    },
    {
      icon: Radio,
      value: pickDashboardQuery.isSuccess ? String(pickGroups.live.length) : loadingValue,
      label: "Live Now",
      sub: pickGroups.live.length > 0 ? "Matches in play" : "No live picks",
      subColor: "text-emerald-400",
      accent: "emerald",
    },
    {
      icon: Coins,
      value: balanceQuery.data ? balanceQuery.data.balance.toLocaleString() : balanceQuery.isError ? "—" : loadingValue,
      label: "Total Chips",
      sub: "Vault Balance",
      subColor: "text-amber-400",
      accent: "amber",
      big: true,
    },
  ];

  const quickActions = [
    { label: "Make Picks", icon: Target, path: "/picks", color: "text-emerald-400 bg-emerald-500/15" },
    { label: "Fixtures", icon: Calendar, path: "/fixtures", color: "text-sky-400 bg-sky-500/15" },
    { label: "Vault", icon: Coins, path: "/shop", color: "text-amber-400 bg-amber-500/15" },
    { label: "Invite & Earn", icon: Gift, path: "/menu/refer", color: "text-violet-300 bg-violet-500/15" },
  ];

  return (
    <>
      <Header betaLabel="BETA" />
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {/* Join New Leagues */}
        <div className="px-4 flex items-center justify-between mb-2">
          <span className="text-[12px] font-bold text-zinc-300 tracking-wide">JOIN NEW LEAGUES</span>
          <button onClick={() => setLocation("/leagues/explore")} className="text-[11px] text-emerald-400 font-medium flex items-center gap-0.5">
            View All Leagues <ChevronRight size={12} />
          </button>
        </div>
        {joinError ? (
          <div className="mx-4 mb-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">
            {joinError}
          </div>
        ) : null}
        <div className="scroll-smooth snap-x pl-4 flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {competitionsQuery.isLoading ? (
            <div className="flex h-[165px] w-[135px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[10px] text-zinc-500">
              Loading…
            </div>
          ) : null}
          {competitionsQuery.data?.slice(0, 5).map((competition) => {
            const availableBalance = balanceQuery.data?.balance;
            const shortfall = availableBalance === undefined
              ? 0
              : Math.max(0, competition.entryFeeChips - availableBalance);
            const hasInsufficientChips = shortfall > 0;
            const isJoining = joinState.isLoading && joiningKey === competition.competitionKey;
            const hotThreshold = Math.max(5, Math.ceil(competition.maxMembersPerCohort * 0.75));
            const isHot = competition.joinedEntries >= hotThreshold;
            return (
              <div key={competition.competitionKey} className="snap-start relative w-[145px] shrink-0 rounded-xl border border-emerald-500/30 bg-white/[0.03] p-3">
                {isHot && (
                  <span className="absolute top-2 right-2 text-[8px] font-bold text-emerald-400 border border-emerald-500/40 rounded-full px-1.5 py-0.5">HOT</span>
                )}
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-[9px] font-bold text-zinc-900 mb-2">
                  {competition.emblem ? <img src={competition.emblem} alt="" className="h-7 w-7 object-contain" /> : competitionInitials(competition.name)}
                </div>
                <div className="line-clamp-2 min-h-8 text-[12px] font-semibold leading-tight text-white">{competition.name} Survivor</div>
                <div className="mt-1 text-[9px] text-zinc-500">
                  {competition.startingRound === null ? "No open round" : `Starts GW${competition.startingRound}`}
                </div>
                <div className="mb-1.5 mt-1 flex items-center gap-1 text-[9px] font-medium text-emerald-400">
                  <Clock size={9} /> {lockLabel(competition.locksAt, now)}
                </div>
                <div className="mb-2 flex items-center gap-1 text-[9px] text-amber-300">
                  <Coins size={9} /> {competition.entryFeeChips === 0 ? "Free" : `${competition.entryFeeChips.toLocaleString()} chips`}
                </div>
                {hasInsufficientChips ? <div className="mb-1 text-[8px] text-red-300">Need {shortfall.toLocaleString()} more</div> : null}
                <button
                  onClick={() => join(competition)}
                  disabled={!competition.available || joinState.isLoading || balanceQuery.isLoading || hasInsufficientChips}
                  className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/15 py-1.5 text-center text-[10px] font-bold text-emerald-400 disabled:border-white/10 disabled:bg-white/5 disabled:text-zinc-600"
                >
                  {isJoining ? "Joining…" : hasInsufficientChips ? "Not enough" : "Join Now"}
                </button>
              </div>
            );
          })}
          {competitionsQuery.isError ? (
            <button
              onClick={() => competitionsQuery.refetch()}
              className="flex h-[165px] w-[145px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-3 text-center text-[10px] text-zinc-400"
            >
              Could not load leagues. Tap to retry.
            </button>
          ) : null}
          <div className="shrink-0 w-2" />
        </div>

        {/* Friends Leagues */}
        <div className="px-4 flex items-center justify-between mt-5 mb-2">
          <span className="text-[12px] font-bold text-zinc-300 tracking-wide">FRIENDS LEAGUES</span>
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation("/friends-leagues/requests")} className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
              Requests
              {pendingRequests > 0 ? (
                <span className="bg-amber-500 text-black text-[9px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{pendingRequests}</span>
              ) : null}
            </button>
            <button onClick={() => setLocation("/friends-leagues")} className="text-[11px] text-emerald-400 font-medium flex items-center gap-0.5">
              View All <ChevronRight size={12} />
            </button>
          </div>
        </div>
        <div className="pl-4 flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {leaguesQuery.isLoading ? (
            <div className="flex w-[160px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[10px] text-zinc-500">
              Loading…
            </div>
          ) : null}
          {friendsLeagues.map((f) => (
            <div key={f.id} className="shrink-0 w-[160px] bg-white/[0.03] border border-white/10 rounded-xl p-3">
              <div className="w-8 h-8 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-[9px] font-bold text-violet-300 mb-2">
                {competitionInitials(f.name)}
              </div>
              <div className="text-white text-[13px] font-semibold leading-tight line-clamp-2">{f.name}</div>
              <div className={`text-[10px] mb-2.5 ${leagueStatusLabel(f, now).color}`}>{leagueStatusLabel(f, now).text}</div>
              <button
                onClick={() => setLocation(`/leagues/${f.id}`)}
                className="w-full text-center rounded-lg py-1.5 text-[11px] font-bold border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 flex items-center justify-center gap-1"
              >
                Enter <ChevronRightCircle size={12} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setLocation("/friends-leagues/create")}
            className="shrink-0 w-[130px] border border-dashed border-white/15 rounded-xl p-3 flex flex-col items-center justify-center text-center gap-1.5"
          >
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
              <Plus size={15} className="text-zinc-400" />
            </div>
            <span className="text-[11px] text-zinc-400 font-medium leading-tight">Create Friends League</span>
          </button>
          <button
            onClick={() => setLocation("/friends-leagues/join-by-code")}
            className="shrink-0 w-[130px] border border-dashed border-violet-500/25 bg-violet-500/[0.04] rounded-xl p-3 flex flex-col items-center justify-center text-center gap-1.5"
          >
            <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center">
              <KeyRound size={15} className="text-violet-300" />
            </div>
            <span className="text-[11px] text-violet-300 font-medium leading-tight">Join with Code</span>
          </button>
          <div className="shrink-0 w-2" />
        </div>

        {/* Your Dashboard */}
        <div className="px-4 mt-5 mb-2 text-[12px] font-bold text-zinc-300 tracking-wide">YOUR DASHBOARD</div>
        <div className="mx-4 bg-white/[0.02] border border-white/5 rounded-2xl p-3">
          <div className="grid grid-cols-4 gap-1">
            {dashboardStats.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="flex flex-col items-center text-center">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 ${s.accent === "emerald" ? "bg-emerald-500/15" : "bg-amber-500/15"}`}>
                    <Icon size={16} className={s.accent === "emerald" ? "text-emerald-400" : "text-amber-400"} />
                  </div>
                  <div className={`font-extrabold ${s.big ? "text-[13px]" : "text-[16px]"} text-white`}>{s.value}</div>
                  <div className="text-zinc-400 text-[9px] leading-tight mt-0.5">{s.label}</div>
                  <div className={`text-[8px] leading-tight mt-0.5 ${s.subColor}`}>{s.sub}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-4 mt-5 mb-2 text-[12px] font-bold text-zinc-300 tracking-wide">QUICK ACTIONS</div>
        <div className="mx-4 grid grid-cols-4 gap-2">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => setLocation(action.path)}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] py-3"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${action.color}`}>
                <action.icon size={16} />
              </span>
              <span className="text-[10px] font-medium leading-tight text-zinc-300">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Your Leagues */}
        <div className="px-4 flex items-center justify-between mt-5 mb-2">
          <span className="text-[12px] font-bold text-zinc-300 tracking-wide">YOUR LEAGUES</span>
          <button onClick={() => setLocation("/my-leagues")} className="text-[11px] text-emerald-400 font-medium flex items-center gap-0.5">
            My Leagues <ChevronRight size={12} />
          </button>
        </div>
        <div className="mx-4 mb-4 space-y-2">
          {leaguesQuery.isLoading ? <div className="py-4 text-center text-[11px] text-zinc-500">Loading your leagues…</div> : null}
          {leaguesQuery.isError ? (
            <button onClick={() => leaguesQuery.refetch()} className="w-full py-4 text-center text-[11px] text-zinc-400">
              Could not load your leagues. Tap to retry.
            </button>
          ) : null}
          {leaguesQuery.isSuccess && myLeagues.length === 0 ? (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] py-4 text-center text-[11px] text-zinc-500">
              You haven't joined any leagues yet.
            </div>
          ) : null}
          {[...ongoingLeagues, ...myLeagues.filter((league) => !isOngoing(league))].slice(0, 5).map((league) => {
            const status = leagueStatusLabel(league, now);
            return (
              <button
                key={league.id}
                onClick={() => setLocation(`/leagues/${league.id}`)}
                className="w-full flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 text-left"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-white">{league.name}</div>
                  <div className="text-[10px] text-zinc-500">
                    {league.type === "friends" ? "Friends League" : `GW${league.currentGameweek}`} · {league.code}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`text-[10px] font-semibold ${status.color}`}>{status.text}</span>
                  <ChevronRight size={14} className="text-zinc-600" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <BottomNav />
    </>
  );
}
