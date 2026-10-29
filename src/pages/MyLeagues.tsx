import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Clock, Coins, Shield, Trophy } from "lucide-react";
import { Crest } from "../components/Crest";
import { Header } from "../components/Header";
import {
  DASHBOARD_MAX_AGE_SECONDS,
  type MyLeague,
  type PickDashboardItem,
  type PredictorDashboardItem,
  useGetFootballCompetitionsQuery,
  useGetLeaguesQuery,
  useGetPickDashboardQuery,
  useGetPredictorDashboardQuery,
} from "../services/api/knoxitApi";
import { gameLabel } from "../components/GameTypeSwitch";

type Tab = "active" | "friends" | "knocked" | "won";

const accentBorder: Record<string, string> = {
  epl: "border-l-emerald-500",
  la_liga: "border-l-violet-500",
  bundesliga: "border-l-red-500",
  ucl: "border-l-sky-500",
  serie_a: "border-l-amber-500",
};

function lockLabel(league: MyLeague) {
  if (league.status === "active") return "IN PROGRESS";
  if (league.status === "completed") return "COMPLETED";
  if (league.status === "split") return "VAULT SPLIT";
  if (!league.locksAt) return "UPCOMING";
  const minutes = Math.ceil((new Date(league.locksAt).getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return "LOCKED";
  if (minutes < 60) return `LOCKS IN ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `LOCKS IN ${hours}h ${minutes % 60}m` : `LOCKS IN ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function roundLabel(league: MyLeague) {
  const startRound = league.startingRound ?? league.currentGameweek;
  if (league.status === "upcoming") return `Starts GW${startRound}`;
  if (league.status === "active") return startRound === league.currentGameweek ? `GW${league.currentGameweek}` : `Started GW${startRound} · now GW${league.currentGameweek}`;
  return `Started GW${startRound}`;
}

function PredictionLine({ item }: { item: PredictorDashboardItem | undefined }) {
  if (!item) return null;
  if (item.toPredict > 0) {
    return <div className="mt-1.5 pl-11 text-[12px] font-semibold text-amber-400">{item.toPredict} of {item.totalMatches} to predict · GW{item.gameweek}</div>;
  }
  return <div className="mt-1.5 pl-11 text-[12px] text-zinc-400">{item.predictedMatches} of {item.totalMatches} predicted · GW{item.gameweek}</div>;
}

function PickLine({ league, item }: { league: MyLeague; item: PickDashboardItem | undefined }) {
  if (league.memberStatus === "knocked_out" || !item) return null;
  if (item.pick) {
    return (
      <div className="mt-1.5 truncate pl-11 text-[12px] text-zinc-400">
        Pick: <span className="font-semibold text-white">{item.pick.primaryTeam}</span>
        {item.pick.backupTeam ? <> · Backup: <span className="text-zinc-300">{item.pick.backupTeam}</span></> : null}
      </div>
    );
  }
  if (item.canSubmit) return <div className="mt-1.5 pl-11 text-[12px] font-semibold text-amber-400">Pick needed</div>;
  return null;
}

function LeagueCard({ league, crest, pickItem, predictorItem }: {
  league: MyLeague;
  crest: string | null;
  pickItem: PickDashboardItem | undefined;
  predictorItem: PredictorDashboardItem | undefined;
}) {
  const [, setLocation] = useLocation();
  const friends = league.type === "friends";
  const border = friends ? "border-l-violet-500" : (accentBorder[league.competitionKey ?? ""] ?? "border-l-emerald-500");

  return (
    <button
      onClick={() => setLocation(`/leagues/${league.id}`)}
      className={`w-full rounded-xl border border-white/5 border-l-[3px] ${border} bg-white/[0.03] p-3 text-left`}
    >
      <div className="flex items-start justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white">
            <Crest src={crest} name={league.name} size={26} className="text-zinc-900" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold leading-tight text-white">{league.name}</span>
              <span className="shrink-0 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[12px] font-bold text-zinc-400">{league.code}</span>
            </div>
            <span
              data-game-tag={league.gameType}
              className={`mt-0.5 inline-block rounded px-1 py-0.5 text-[12px] font-bold uppercase tracking-wide ${
                league.gameType === "predictor" ? "bg-sky-500/15 text-sky-300" : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {gameLabel(league.gameType)}
            </span>
            <div className="mt-0.5 text-[12px] text-zinc-500">
              {friends ? `Friends League · ${roundLabel(league)}` : roundLabel(league)}
            </div>
          </div>
        </div>
        <ChevronRight size={16} className="shrink-0 text-zinc-600" />
      </div>

      <div className="mt-2 flex items-center justify-between pl-11">
        <span className={`flex items-center gap-1 text-[12px] font-semibold ${league.memberStatus === "knocked_out" ? "text-red-400" : "text-emerald-400"}`}>
          <Clock size={11} /> {league.memberStatus === "knocked_out" ? "KNOCKED OUT" : lockLabel(league)}
        </span>
        {!friends ? (
          <span className="flex items-center gap-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[12px] font-bold text-amber-400">
            <Coins size={12} /> Vault {league.vaultChips.toLocaleString()}
          </span>
        ) : null}
      </div>
      {league.gameType === "predictor" ? <PredictionLine item={predictorItem} /> : <PickLine league={league} item={pickItem} />}
    </button>
  );
}

export default function MyLeagues() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("active");
  const leaguesQuery = useGetLeaguesQuery(undefined, { refetchOnMountOrArgChange: DASHBOARD_MAX_AGE_SECONDS });
  const competitionsQuery = useGetFootballCompetitionsQuery();
  const pickDashboardQuery = useGetPickDashboardQuery(undefined, { refetchOnMountOrArgChange: DASHBOARD_MAX_AGE_SECONDS });
  const leagues = leaguesQuery.data ?? [];
  const crestByCompetition = new Map((competitionsQuery.data ?? []).map((competition) => [competition.key, competition.emblem]));
  const pickByLeague = new Map((pickDashboardQuery.data?.items ?? []).map((item) => [item.leagueId, item]));
  const predictorQuery = useGetPredictorDashboardQuery(undefined, { refetchOnMountOrArgChange: DASHBOARD_MAX_AGE_SECONDS });
  const predictionsByLeague = new Map((predictorQuery.data?.items ?? []).map((item) => [item.leagueId, item]));
  const byTab: Record<Tab, MyLeague[]> = {
    active: leagues.filter((league) => league.type === "competitive" && league.memberStatus === "alive" && league.status !== "completed" && league.status !== "split"),
    friends: leagues.filter((league) => league.type === "friends"),
    knocked: leagues.filter((league) => league.memberStatus === "knocked_out"),
    // Survivor: still alive when it ended. Predictor: everyone plays to the end.
    won: leagues.filter((league) => league.memberStatus === "alive" && (league.status === "completed" || league.status === "split")),
  };
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "active", label: "ACTIVE" },
    { key: "friends", label: "FRIENDS" },
    { key: "knocked", label: "KNOCKED OUT" },
    { key: "won", label: "FINISHED" },
  ];

  return (
    <>
      <Header />
      <div className="px-4 mt-1">
        <div className="text-white text-[22px] font-extrabold leading-tight">My Leagues</div>
        <div className="text-zinc-500 text-[12px] mt-0.5">Your Survivor and Predictor leagues</div>
      </div>

      <div className="flex gap-4 overflow-x-auto px-4 mt-4 border-b border-white/5 no-scrollbar">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex min-h-11 items-end pb-2.5 text-[12px] font-bold tracking-wide border-b-2 -mb-px whitespace-nowrap ${tab === item.key ? "border-emerald-400 text-emerald-400" : "border-transparent text-zinc-500"}`}
          >
            {item.label} ({byTab[item.key].length})
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-3">
        {leaguesQuery.isLoading ? <div className="pt-16 text-center text-[12px] text-zinc-500">Loading your leagues…</div> : null}
        {leaguesQuery.isError ? (
          <div className="pt-12 text-center">
            <div className="text-[12px] text-red-300">Could not load your leagues.</div>
            <button onClick={() => leaguesQuery.refetch()} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-zinc-300">Try again</button>
          </div>
        ) : null}

        {leaguesQuery.isSuccess && byTab[tab].length ? (
          <div className="space-y-2.5">{byTab[tab].map((league) => (
            <LeagueCard
              key={league.id}
              league={league}
              crest={crestByCompetition.get(league.competitionKey ?? "") ?? null}
              pickItem={pickByLeague.get(league.id)}
              predictorItem={predictionsByLeague.get(league.id)}
            />
          ))}</div>
        ) : null}
        {leaguesQuery.isSuccess && byTab[tab].length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-3">
              <Trophy size={20} className="text-zinc-600" />
            </div>
            <div className="text-zinc-500 text-[12px]">Nothing here yet</div>
          </div>
        ) : null}

        <div className="mt-4 mb-4 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl px-3 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
            <Shield size={15} className="text-emerald-400" />
          </div>
          <div className="flex-1">
            <div className="text-white text-[12px] font-medium leading-tight">Compete in more leagues to increase your chances.</div>
            <div className="text-zinc-500 text-[12px] mt-0.5">Survive each Gameweek to unlock the vault.</div>
          </div>
        </div>
        <button onClick={() => setLocation("/leagues/explore")} className="min-h-11 w-full mb-4 text-emerald-400 text-[12px] font-bold border border-emerald-500/30 rounded-xl">
          Explore Leagues
        </button>
      </div>
    </>
  );
}
