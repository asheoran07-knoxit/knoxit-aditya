import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Coins, Settings, Shield } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { normalizeApiError } from "../services/api/error";
import { useGetLeagueDetailQuery } from "../services/api/knoxitApi";
import { canTakeLeagueAction } from "../domain/rules";

function formatCountdown(milliseconds: number) {
  if (milliseconds <= 0) return "Locked";
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return days > 0
    ? `${days}d ${hours}h ${minutes}m`
    : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function statusLabel(status: "upcoming" | "active" | "completed" | "split") {
  if (status === "upcoming") return "Upcoming";
  if (status === "active") return "Active";
  if (status === "split") return "Vault split";
  return "Completed";
}

export default function LeagueDetail() {
  const [, params] = useRoute("/leagues/:id");
  const [, setLocation] = useLocation();
  const leagueId = (params as { id?: string } | null)?.id;
  const detailQuery = useGetLeagueDetailQuery(leagueId ?? "", { skip: !leagueId });
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [responseReceivedAt, setResponseReceivedAt] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (detailQuery.data?.serverNow) setResponseReceivedAt(Date.now());
  }, [detailQuery.data?.serverNow]);

  if (!leagueId) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-red-300">Invalid league link</div>;
  }

  if (detailQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">Loading league…</div>;
  }

  if (detailQuery.isError || !detailQuery.data) {
    const error = detailQuery.error ? normalizeApiError(detailQuery.error).message : "League could not be loaded";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <AlertCircle className="mb-3 text-red-400" size={28} />
        <div className="text-sm font-semibold text-white">Unable to open this league</div>
        <div className="mt-1 text-xs text-zinc-500">{error}</div>
        <button onClick={() => detailQuery.refetch()} className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-xs text-zinc-300">Try again</button>
        <button onClick={() => setLocation("/my-leagues")} className="mt-2 px-4 py-2 text-xs text-emerald-400">Back to My Leagues</button>
      </div>
    );
  }

  const league = detailQuery.data;
  const serverAtResponse = new Date(league.serverNow).getTime();
  const effectiveServerNow = serverAtResponse + (clockNow - responseReceivedAt);
  const remainingMilliseconds = league.locksAt ? new Date(league.locksAt).getTime() - effectiveServerNow : 0;
  const beforeLock = remainingMilliseconds > 0;
  const showTakeAction = league.canTakeAction && canTakeLeagueAction({
    leagueStatus: league.status,
    memberStatus: league.memberStatus,
    locksAt: league.locksAt,
    hasCurrentPick: league.currentPick !== null,
    now: effectiveServerNow,
  });
  const localLockLabel = league.locksAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(league.locksAt))
    : "Not scheduled";

  let unavailableMessage = "Pick action is not available.";
  if (league.memberStatus === "knocked_out") unavailableMessage = "You have been knocked out of this league.";
  else if (league.currentPick) unavailableMessage = "Your pick is submitted for this gameweek.";
  else if (!league.locksAt) unavailableMessage = "The gameweek lock has not been scheduled.";
  else if (!beforeLock) unavailableMessage = "The pick window is locked.";
  else if (league.status === "completed") unavailableMessage = "This league has completed.";
  else if (league.status === "split") unavailableMessage = "This league ended with a vault split.";

  return (
    <>
      <header className="border-b border-white/5 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setLocation("/my-leagues")} className="text-lg text-zinc-300" aria-label="Back to My Leagues">←</button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-sm font-bold text-white">{league.name}</div>
            <div className="mt-0.5 text-[10px] text-zinc-500">{league.code}</div>
          </div>
          {league.canManageSettings ? (
            <button onClick={() => setLocation(`/leagues/${league.id}/manage-admins`)} aria-label="League settings">
              <Settings size={17} className="text-zinc-400" />
            </button>
          ) : <div className="w-[17px]" />}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
            <div className="text-[10px] text-zinc-500">Gameweek</div>
            <div className="mt-0.5 text-base font-bold text-white">GW{league.currentGameweek}</div>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2.5">
            <div className="text-[10px] text-emerald-400">League status</div>
            <div className="mt-0.5 text-sm font-bold text-emerald-300">{statusLabel(league.status)}</div>
          </div>
        </div>

        <section className={`mt-3 rounded-2xl border p-4 ${beforeLock ? "border-red-500/25 bg-red-500/[0.08]" : "border-white/10 bg-white/[0.03]"}`}>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-red-300"><Clock size={12} /> Gameweek lock</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-white" aria-live="polite">
            {league.locksAt ? formatCountdown(remainingMilliseconds) : "Not scheduled"}
          </div>
          <div className="mt-1 text-[10px] text-zinc-500">{localLockLabel} · shown in your local timezone</div>
        </section>

        <section className="mt-3 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/[0.1] to-amber-500/[0.03] p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-400"><Coins size={12} /> League vault</div>
              <div className="mt-1 text-2xl font-extrabold text-amber-300">{league.vaultChips.toLocaleString()} chips</div>
            </div>
            <Shield size={30} className="text-amber-400/60" />
          </div>
          <div className="mt-3 grid grid-cols-2 border-t border-amber-500/15 pt-3 text-center">
            <div><div className="text-base font-bold text-white">{league.aliveCount}</div><div className="text-[9px] uppercase tracking-wide text-zinc-500">Survivors</div></div>
            <div className="border-l border-amber-500/15"><div className="text-base font-bold text-white">{league.joinedCount}</div><div className="text-[9px] uppercase tracking-wide text-zinc-500">Joined</div></div>
          </div>
        </section>

        <section className={`mt-3 rounded-2xl border p-4 ${showTakeAction ? "border-emerald-500/35 bg-emerald-500/[0.09]" : "border-white/10 bg-white/[0.03]"}`}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">Your gameweek action</div>
          {league.currentPick ? (
            <div className="mt-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400"><CheckCircle2 size={14} /> Pick submitted</div>
              <div className="mt-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                <div className="text-sm font-bold text-white">Primary: {league.currentPick.primaryTeam}</div>
                <div className="mt-0.5 text-xs text-zinc-500">Backup: {league.currentPick.backupTeam ?? "None"}</div>
              </div>
            </div>
          ) : showTakeAction ? (
            <div className="mt-2">
              <div className="text-xs text-zinc-300">You have not submitted a pick for GW{league.currentGameweek}.</div>
              <button onClick={() => setLocation(`/picks/submit/${league.id}`)} className="mt-3 w-full rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-black">Take Action</button>
            </div>
          ) : (
            <div className="mt-2 text-xs text-zinc-500">{unavailableMessage}</div>
          )}
        </section>
      </main>
    </>
  );
}
