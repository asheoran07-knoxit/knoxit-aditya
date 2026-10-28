// Route: /leagues/:leagueId/opponent/:userId
// A league member's profile as seen by another member of the same league.
import { useLocation, useRoute } from "wouter";
import { AlertCircle, CheckCircle2, Clock, Lock, XCircle } from "lucide-react";
import { SubHeader } from "../components/Header";
import { normalizeApiError } from "../services/api/error";
import { type PlayerProfile, useGetPlayerProfileQuery } from "../services/api/knoxitApi";

function PickRow({ pick }: { pick: PlayerProfile["picks"][number] }) {
  if (pick.hidden) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px]">
        <span className="text-zinc-400">GW{pick.gameweek}</span>
        <span className="flex items-center gap-1 text-amber-300"><Lock size={12} /> Hidden until lock</span>
      </div>
    );
  }
  if (pick.result === "no_pick") {
    return (
      <div className="flex items-center justify-between rounded-lg bg-red-500/[0.06] px-3 py-2 text-[12px]">
        <span className="text-zinc-400">GW{pick.gameweek}</span>
        <span className="text-red-300">No pick</span>
        <XCircle size={14} className="text-red-400" />
      </div>
    );
  }
  const team = pick.usedBackup ? pick.backupTeam : pick.primaryTeam;
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-[12px]">
      <span className="text-zinc-400">GW{pick.gameweek}</span>
      <span className={pick.result === "eliminated" ? "text-red-300" : pick.result === "survived" ? "text-emerald-400" : "text-zinc-200"}>
        {team}{pick.usedBackup ? " (backup)" : ""}
      </span>
      {pick.result === "survived" ? <CheckCircle2 size={14} className="text-emerald-400" />
        : pick.result === "eliminated" ? <XCircle size={14} className="text-red-400" />
        : <Clock size={13} className="text-amber-400" />}
    </div>
  );
}

export default function OpponentProfile() {
  const [, params] = useRoute("/leagues/:leagueId/opponent/:userId");
  const [, setLocation] = useLocation();
  const leagueId = (params as { leagueId?: string } | null)?.leagueId ?? "";
  const userId = (params as { userId?: string } | null)?.userId ?? "";
  const profileQuery = useGetPlayerProfileQuery({ leagueId, userId }, { skip: !leagueId || !userId });
  const back = () => setLocation(`/leagues/${leagueId}`);

  if (profileQuery.isLoading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">Loading player…</div>;
  }
  if (profileQuery.isError || !profileQuery.data) {
    const message = profileQuery.error ? normalizeApiError(profileQuery.error).message : "Player could not be loaded";
    return (
      <>
        <SubHeader title="Player" onBack={back} />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <AlertCircle className="mb-3 text-red-400" size={28} />
          <div className="text-sm font-semibold text-white">Unable to open this player</div>
          <div className="mt-1 text-xs text-zinc-500">{message}</div>
        </div>
      </>
    );
  }

  const player = profileQuery.data;
  const out = player.status === "knocked_out";
  const stats = [
    { label: "Current streak", value: String(player.stats.currentStreak) },
    { label: "GWs survived", value: String(player.stats.gameweeksSurvived) },
    { label: "Record", value: `${player.stats.gameweeksSurvived}–${player.stats.gameweeksPlayed - player.stats.gameweeksSurvived}` },
    { label: "Survival rate", value: player.stats.survivalRate === null ? "—" : `${player.stats.survivalRate}%` },
  ];

  return (
    <>
      <SubHeader title={player.leagueName} onBack={back} />
      <div className="flex-1 overflow-y-auto no-scrollbar pb-4">
        <div className="flex flex-col items-center border-b border-white/5 pb-4 pt-2">
          <div className={`mb-2 flex h-16 w-16 items-center justify-center rounded-full border-2 bg-zinc-800 text-lg font-bold text-zinc-300 ${out ? "border-red-500/50" : "border-emerald-400/50"}`}>
            {player.username.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-[15px] font-bold text-white">{player.username}{player.isYou ? " (you)" : ""}</div>
          <div className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${out ? "text-red-400" : "text-emerald-400"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${out ? "bg-red-400" : "bg-emerald-400"}`} />
            {out ? `OUT${player.knockedOutAtGameweek ? ` · GW${player.knockedOutAtGameweek}` : ""}` : "STILL ALIVE"}
          </div>
          {player.isCreator ? <div className="mt-1 text-[10px] font-bold text-amber-400">LEAGUE CREATOR</div> : player.isAdmin ? <div className="mt-1 text-[10px] font-bold text-emerald-400">ADMIN</div> : null}
          {player.stats.currentStreak > 0 ? (
            <div className="mt-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300">
              🔥 Survived {player.stats.currentStreak} straight GW{player.stats.currentStreak === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>

        <div className="mx-4 mt-4 grid grid-cols-4 gap-2">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border border-white/5 bg-white/[0.03] py-2 text-center">
              <div className="text-[14px] font-bold text-white">{stat.value}</div>
              <div className="mt-0.5 text-[9px] leading-tight text-zinc-500">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="mx-4 mt-4">
          <div className="mb-2 text-[11px] font-semibold text-zinc-400">PICKS</div>
          {player.picks.length === 0 ? (
            <div className="rounded-lg bg-white/[0.02] px-3 py-3 text-center text-[12px] text-zinc-500">No picks yet.</div>
          ) : (
            <div className="space-y-1.5">
              {player.picks.map((pick) => <PickRow key={pick.gameweek} pick={pick} />)}
            </div>
          )}
          <div className="mt-2 text-[10px] text-zinc-600">Picks stay hidden until the gameweek locks.</div>
        </div>
      </div>
    </>
  );
}
