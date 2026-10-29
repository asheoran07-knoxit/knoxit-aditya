// artifacts/knoxit/src/pages/Picks.tsx
// Route: /picks
//
// Purpose (25 Jul 2026 decision, kept deliberately distinct from My Leagues):
// My Leagues is organized BY LEAGUE (browse). This is organized BY URGENCY/
// ACTION across every league at once — its whole job is making sure nobody
// gets accidentally eliminated because they didn't realize multiple leagues
// were locking soon. Scoped to 4 sections for now (Locking Soon, Submitted,
// Live, Awaiting Results) — Pick History deferred, lowest urgency of the
// original 5 sections.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Clock, Radio, CheckCircle2, AlertTriangle } from "lucide-react";
import { Header } from "../components/Header";
import { DASHBOARD_MAX_AGE_SECONDS, useGetPickDashboardQuery, useGetPredictorDashboardQuery } from "../services/api/knoxitApi";
import { groupPickDashboard, lockCountdown, pickedTeam } from "../features/picks/pickDashboard";
import { fixtureDisplay } from "../features/fixtures/fixtureDisplay";

export default function Picks() {
  const [, setLocation] = useLocation();
  const dashboardQuery = useGetPickDashboardQuery(undefined, { pollingInterval: 60_000, refetchOnMountOrArgChange: DASHBOARD_MAX_AGE_SECONDS });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const predictorQuery = useGetPredictorDashboardQuery(undefined, { pollingInterval: 60_000, refetchOnMountOrArgChange: DASHBOARD_MAX_AGE_SECONDS });
  const predictorItems = [...(predictorQuery.data?.items ?? [])].sort((left, right) =>
    (right.toPredict > 0 ? 1 : 0) - (left.toPredict > 0 ? 1 : 0)
    || new Date(left.nextLock ?? "9999-12-31").getTime() - new Date(right.nextLock ?? "9999-12-31").getTime()
  );
  const { lockingSoon, submitted, live, awaitingResults } = groupPickDashboard(dashboardQuery.data?.items ?? []);
  const nothingToShow = lockingSoon.length === 0 && submitted.length === 0 && live.length === 0 && awaitingResults.length === 0 && predictorItems.length === 0;

  return (
    <>
      <Header />
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-1 pb-2">
        {dashboardQuery.isLoading ? (
          <div className="pt-16 text-center text-[12px] text-zinc-500">Loading your picks…</div>
        ) : null}
        {dashboardQuery.isError ? (
          <div className="pt-12 text-center">
            <div className="text-[12px] text-red-300">Could not load your picks.</div>
            <button onClick={() => dashboardQuery.refetch()} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[11px] text-zinc-300">Try again</button>
          </div>
        ) : null}

        {lockingSoon.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-3 mb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
              <AlertTriangle size={16} className="text-red-400" />
            </div>
            <div className="flex-1">
              <div className="text-white text-[12px] font-semibold">
                {lockingSoon.length} {lockingSoon.length === 1 ? "pick" : "picks"} still needed
              </div>
              <div className="text-zinc-500 text-[10px]">Don't miss your chance to survive.</div>
            </div>
          </div>
        )}

        {lockingSoon.length > 0 && (
          <div className="mb-5">
            <div className="text-[11px] font-bold text-red-400 tracking-wide mb-2">LOCKING SOON</div>
            <div className="space-y-2">
              {lockingSoon.map((p) => (
                <button
                  key={p.leagueId}
                  onClick={() => setLocation(`/picks/submit/${p.leagueId}`)}
                  className="w-full flex items-center justify-between border rounded-xl px-3 py-2.5 bg-emerald-500/10 border-emerald-500/25"
                >
                  <div className="text-left">
                    <div className="text-white text-[13px] font-semibold">{p.leagueName}</div>
                    <div className="text-zinc-500 text-[10px]">{p.code} · GW{p.gameweek} · No pick submitted</div>
                  </div>
                  <div className="flex items-center gap-1 text-[12px] font-bold text-emerald-400">
                    <Clock size={12} /> {lockCountdown(p.locksAt, now)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {predictorItems.length > 0 && (
          <div className="mb-5">
            <div className="text-[11px] font-bold text-zinc-400 tracking-wide mb-2">PREDICTIONS</div>
            <div className="space-y-2">
              {predictorItems.map((item) => (
                <button
                  key={item.leagueId}
                  onClick={() => setLocation(`/predict/${item.leagueId}`)}
                  className={`w-full flex items-center justify-between border rounded-xl px-3 py-2.5 ${
                    item.toPredict > 0 ? "bg-sky-500/10 border-sky-500/25" : "bg-white/[0.03] border-white/10"
                  }`}
                >
                  <div className="text-left">
                    <div className="text-white text-[13px] font-semibold">{item.leagueName}</div>
                    <div className="text-zinc-500 text-[10px]">
                      {item.code} · GW{item.gameweek} · {item.toPredict > 0 ? `${item.toPredict} of ${item.totalMatches} to predict` : `${item.predictedMatches} of ${item.totalMatches} predicted`}
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 text-[12px] font-bold ${item.toPredict > 0 ? "text-sky-300" : "text-zinc-500"}`}>
                    <Clock size={12} /> {item.nextLock ? lockCountdown(item.nextLock, now) : "Locked"}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {live.length > 0 && (
          <div className="mb-5">
            <div className="text-[11px] font-bold text-zinc-400 tracking-wide mb-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> LIVE NOW
            </div>
            <div className="space-y-2">
              {live.map((p) => {
                const team = pickedTeam(p);
                const fixture = p.fixture!;
                const pickedHome = fixture.homeTeamName === team;
                const ours = (pickedHome ? fixture.homeScore : fixture.awayScore) ?? 0;
                const theirs = (pickedHome ? fixture.awayScore : fixture.homeScore) ?? 0;
                const winning = ours > theirs;
                return (
                  <div key={p.leagueId} className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white text-[13px] font-semibold">{p.leagueName}</span>
                      <span className="text-red-400 text-[10px] font-bold flex items-center gap-1">
                        <Radio size={10} /> {fixtureDisplay(fixture.status).label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[12px]">
                      <span className={pickedHome ? "text-emerald-400 font-semibold" : "text-zinc-300"}>{fixture.homeTeamName}</span>
                      <span className="text-white font-bold">{fixture.homeScore ?? 0} - {fixture.awayScore ?? 0}</span>
                      <span className={!pickedHome ? "text-emerald-400 font-semibold" : "text-zinc-300"}>{fixture.awayTeamName}</span>
                    </div>
                    <div className={`text-[10px] mt-1 font-medium ${winning ? "text-emerald-400" : "text-amber-400"}`}>
                      {team} {winning ? "winning" : ours === theirs ? "drawing" : "losing"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {awaitingResults.length > 0 && (
          <div className="mb-5">
            <div className="text-[11px] font-bold text-zinc-400 tracking-wide mb-2">AWAITING RESULTS</div>
            <div className="space-y-2">
              {awaitingResults.map((p) => {
                const team = pickedTeam(p);
                const opponent = p.fixture
                  ? (p.fixture.homeTeamName === team ? p.fixture.awayTeamName : p.fixture.homeTeamName)
                  : null;
                const finished = p.fixture ? fixtureDisplay(p.fixture.status).showScore : false;
                return (
                  <div key={p.leagueId} className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-white text-[13px] font-semibold">{p.leagueName}</div>
                      <div className="text-zinc-500 text-[10px]">{team}{opponent ? ` vs ${opponent}` : ""} · GW{p.gameweek}</div>
                    </div>
                    <div className="text-amber-400 text-[10px] font-semibold flex items-center gap-1">
                      <Clock size={10} />
                      {finished
                        ? "Result pending"
                        : p.fixture
                          ? new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(p.fixture.utcDate))
                          : "Kick-off TBC"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {submitted.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] font-bold text-zinc-400 tracking-wide mb-2">SUBMITTED PICKS</div>
            <div className="space-y-2">
              {submitted.map((p) => (
                <button
                  key={p.leagueId}
                  onClick={() => setLocation(`/picks/submit/${p.leagueId}`)}
                  className="w-full text-left bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white text-[13px] font-semibold">{p.leagueName}</span>
                    <span className="text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                      <CheckCircle2 size={11} /> Locks in {lockCountdown(p.locksAt, now)}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-md px-2 py-1">
                      Pick: {p.pick?.primaryTeam}
                    </span>
                    <span className="text-[10px] font-medium bg-white/[0.03] text-zinc-400 border border-white/10 rounded-md px-2 py-1">
                      Backup: {p.pick?.backupTeam ?? "None"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {dashboardQuery.isSuccess && nothingToShow && (
          <div className="flex flex-col items-center justify-center pt-16 text-center">
            <div className="text-zinc-500 text-[12px]">No picks to manage right now.</div>
          </div>
        )}
      </div>
    </>
  );
}
