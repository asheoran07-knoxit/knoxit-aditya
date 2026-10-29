import { Clock, Coins, Target, Users } from "lucide-react";
import { DASHBOARD_MAX_AGE_SECONDS, type LeagueDetail, type LeagueMember, useGetPredictorDashboardQuery } from "../../services/api/knoxitApi";
import { lockCountdown } from "../picks/pickDashboard";

export function PredictorOverview({
  league,
  members,
  membersState,
  onRetryMembers,
  currentUserId,
  now,
  onPredict,
  onOpenProfile,
}: {
  league: LeagueDetail;
  members: LeagueMember[];
  membersState: "loading" | "ready" | "error";
  onRetryMembers: () => void;
  currentUserId: string | undefined;
  now: number;
  onPredict: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  const dashboardQuery = useGetPredictorDashboardQuery(undefined, { refetchOnMountOrArgChange: DASHBOARD_MAX_AGE_SECONDS });
  const mine = dashboardQuery.data?.items.find((item) => item.leagueId === league.id);
  const open = league.status === "upcoming" || league.status === "active";

  return (
    <main className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
          <div className="text-[12px] text-zinc-500">Gameweek</div>
          <div className="mt-0.5 text-base font-bold text-white">GW{mine?.gameweek ?? league.currentGameweek}</div>
          <div className="text-[12px] text-zinc-500">of GW{league.startingRound}–{league.endGameweek}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2.5">
          <div className="text-[12px] text-emerald-400">League status</div>
          <div className="mt-0.5 text-sm font-bold text-emerald-300">{league.status === "completed" ? "Finished" : league.status === "active" ? "In play" : "Upcoming"}</div>
        </div>
      </div>

      <section className={`mt-3 rounded-2xl border p-4 ${mine && mine.toPredict > 0 ? "border-emerald-500/35 bg-emerald-500/[0.09]" : "border-white/10 bg-white/[0.03]"}`}>
        <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-zinc-400"><Target size={12} /> Your predictions</div>
        {!open ? (
          <div className="mt-2 text-xs text-zinc-500">This mini-season has finished. See the final table on the Leaderboard tab.</div>
        ) : mine ? (
          <>
            <div className="mt-2 text-sm font-bold text-white">{mine.predictedMatches} of {mine.totalMatches} predicted</div>
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-amber-400">
              <Clock size={11} /> {mine.nextLock ? `Next lock in ${lockCountdown(mine.nextLock, now)}` : "All matches locked"}
            </div>
          </>
        ) : (
          <div className="mt-2 text-xs text-zinc-500">{dashboardQuery.isLoading ? "Loading…" : "Open the Predict screen to see this gameweek's matches."}</div>
        )}
        <button onClick={onPredict} className={`mt-3 w-full rounded-xl py-3 text-sm font-extrabold ${open ? "bg-emerald-500 text-black" : "border border-white/10 text-zinc-300"}`}>
          {open ? (mine && mine.toPredict > 0 ? "Predict" : "View predictions") : "View predictions"}
        </button>
      </section>

      {league.type === "competitive" ? (
        <section className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide text-amber-400"><Coins size={12} /> League vault</span>
            <span className="text-xl font-extrabold text-amber-300">{league.vaultChips.toLocaleString()} chips</span>
          </div>
          <div className="mt-1 text-[12px] text-zinc-500">Split 60/30/10 between the top 3 after GW{league.endGameweek}.</div>
        </section>
      ) : null}

      <section className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-zinc-400"><Users size={12} /> Players ({members.length || league.joinedCount})</div>
        {membersState === "loading" ? <div className="mt-2 text-[12px] text-zinc-500">Loading players…</div> : null}
        {membersState === "error" ? (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-zinc-500">
            Couldn't load the players.
            <button onClick={onRetryMembers} className="font-semibold text-emerald-400">Try again</button>
          </div>
        ) : null}
        <div className="mt-1.5 divide-y divide-white/5">
          {members.map((member) => (
            <button key={member.userId} onClick={() => onOpenProfile(member.userId)} className="flex min-h-11 w-full items-center gap-2.5 py-1.5 text-left">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-zinc-800 text-[12px] font-bold text-zinc-300">
                {member.username.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-white">{member.username}{member.userId === currentUserId ? " (you)" : ""}</span>
              {member.isCreator ? <span className="text-[12px] font-bold text-amber-400">CREATOR</span> : member.isAdmin ? <span className="text-[12px] font-bold text-emerald-400">ADMIN</span> : null}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
