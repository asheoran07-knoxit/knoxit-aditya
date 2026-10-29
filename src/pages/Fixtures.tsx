import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Crest } from "../components/Crest";
import { Header } from "../components/Header";
import { useAppSelector } from "../app/hooks";
import { ErrorState, Skeleton } from "../components/ui/Feedback";
import { currentGameweek, fixtureDisplay } from "../features/fixtures/fixtureDisplay";
import {
  type FootballFixture,
  useGetFixturesQuery,
  useGetFootballCompetitionsQuery,
  useGetStandingsQuery,
} from "../services/api/knoxitApi";

function FormBadge({ result }: { result: string }) {
  const cls = result === "W" ? "bg-emerald-500/20 text-emerald-400"
    : result === "L" ? "bg-red-500/20 text-red-400"
    : "bg-zinc-600/30 text-zinc-400";
  return <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[12px] font-bold ${cls}`}>{result}</span>;
}

function FixtureRow({ fixture, teamForms }: { fixture: FootballFixture; teamForms: Map<number, string[]> }) {
  const display = fixtureDisplay(fixture.status);
  const kickoff = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(fixture.utcDate));
  const homeForm = fixture.homeTeamId === null ? [] : teamForms.get(fixture.homeTeamId) ?? [];
  const awayForm = fixture.awayTeamId === null ? [] : teamForms.get(fixture.awayTeamId) ?? [];

  return (
    <div className="mb-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Crest src={fixture.homeTeamCrest} name={fixture.homeTeamName} size={24} />
            <span className="truncate text-[13px] font-semibold text-white">{fixture.homeTeamShortName ?? fixture.homeTeamName}</span>
          </div>
          <div className="mt-1 flex gap-1">{homeForm.map((result, index) => <FormBadge key={index} result={result} />)}</div>
        </div>
        <div className="shrink-0 px-2 text-center">
          {display.showScore ? (
            <>
              <div className="text-[15px] font-extrabold tabular-nums text-white">{fixture.homeScore ?? "–"} - {fixture.awayScore ?? "–"}</div>
              <div className={`mt-0.5 text-[12px] font-bold ${display.live ? "text-red-400" : "text-zinc-500"}`}>{display.label}</div>
            </>
          ) : (
            <>
              <div className="text-[12px] font-bold text-zinc-300">{kickoff}</div>
              <div className={`max-w-[96px] truncate text-[12px] ${["POSTPONED", "SUSPENDED", "CANCELLED"].includes(fixture.status) ? "font-bold text-amber-400" : "text-zinc-600"}`}>
                {["POSTPONED", "SUSPENDED", "CANCELLED"].includes(fixture.status) ? display.label : fixture.venue ?? display.label}
              </div>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1 text-right">
          <div className="flex items-center justify-end gap-2">
            <span className="truncate text-[13px] font-semibold text-white">{fixture.awayTeamShortName ?? fixture.awayTeamName}</span>
            <Crest src={fixture.awayTeamCrest} name={fixture.awayTeamName} size={24} />
          </div>
          <div className="mt-1 flex justify-end gap-1">{awayForm.map((result, index) => <FormBadge key={index} result={result} />)}</div>
        </div>
      </div>
    </div>
  );
}

export default function Fixtures() {
  const [league, setLeague] = useState("epl");
  const [selectedMatchdays, setSelectedMatchdays] = useState<Record<string, number>>({});
  const competitionsQuery = useGetFootballCompetitionsQuery();
  const fixturesQuery = useGetFixturesQuery({ league });
  const standingsQuery = useGetStandingsQuery(league);
  const refreshing = competitionsQuery.isFetching || fixturesQuery.isFetching || standingsQuery.isFetching;

  const matchdays = useMemo(
    () => Array.from(new Set((fixturesQuery.data?.fixtures ?? []).flatMap((fixture) => fixture.matchday === null ? [] : [fixture.matchday]))).sort((a, b) => a - b),
    [fixturesQuery.data]
  );
  const competition = competitionsQuery.data?.find((item) => item.key === league) ?? fixturesQuery.data?.competitions[0];
  // The provider's current matchday, moved on once all its matches are over.
  const current = useMemo(
    () => currentGameweek(fixturesQuery.data?.fixtures ?? [], competition?.currentMatchday),
    [fixturesQuery.data, competition?.currentMatchday]
  );
  const defaultMatchday = current ?? matchdays[0];
  // Reloading cached data is an admin tool; players get fresh data automatically.
  const isAdmin = useAppSelector((state) => state.auth.user?.isOperationsAdmin ?? false);
  const matchday = selectedMatchdays[league] ?? defaultMatchday;
  const matchdayIndex = matchday === undefined ? -1 : matchdays.indexOf(matchday);
  const fixtures = (fixturesQuery.data?.fixtures ?? []).filter((fixture) => fixture.matchday === matchday);
  const teamForms = useMemo(
    () => new Map((standingsQuery.data?.standings ?? []).map((standing) => [standing.teamId, standing.form])),
    [standingsQuery.data]
  );

  const selectMatchday = (value: number) => setSelectedMatchdays((current) => ({ ...current, [league]: value }));
  const loading = competitionsQuery.isLoading || fixturesQuery.isLoading;
  const loadError = competitionsQuery.isError || fixturesQuery.isError;

  const refreshFixtures = async () => {
    await Promise.all([
      competitionsQuery.refetch(),
      fixturesQuery.refetch(),
      standingsQuery.refetch(),
    ]);
  };

  return (
    <>
      <Header />
      <div className="mb-1 flex items-center justify-between px-4">
        <div>
          <div className="text-[16px] font-extrabold text-white">Fixtures</div>
          <div className="text-[12px] text-zinc-500">Latest schedules, scores and form from the synced football feed.</div>
        </div>
        {isAdmin ? <button
          onClick={() => void refreshFixtures()}
          disabled={refreshing}
          title="Reload the latest data cached by the scheduled football sync"
          className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1.5 text-[12px] font-bold text-emerald-400 disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh fixtures"}
        </button> : null}
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pt-2 no-scrollbar">
        {(competitionsQuery.data ?? []).map((item) => (
          <button
            key={item.key}
            onClick={() => setLeague(item.key)}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-[12px] font-semibold ${
              league === item.key ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400" : "border-white/10 text-zinc-400"
            }`}
          >
            {item.shortLabel ?? item.name}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <button
          onClick={() => matchdayIndex > 0 && selectMatchday(matchdays[matchdayIndex - 1])}
          disabled={matchdayIndex <= 0}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] disabled:opacity-30"
        >
          <ChevronLeft size={16} className="text-zinc-300" />
        </button>
        <div className="text-center">
          <div className="text-[14px] font-bold text-white">{matchday === undefined ? "No matchday" : `Gameweek ${matchday}`}</div>
          {matchday === current && <div className="text-[12px] font-medium text-emerald-400">Current</div>}
        </div>
        <button
          onClick={() => matchdayIndex >= 0 && matchdayIndex < matchdays.length - 1 && selectMatchday(matchdays[matchdayIndex + 1])}
          disabled={matchdayIndex < 0 || matchdayIndex >= matchdays.length - 1}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] disabled:opacity-30"
        >
          <ChevronRight size={16} className="text-zinc-300" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-2 no-scrollbar">
        {loading ? <><Skeleton className="mb-2 h-16" /><Skeleton className="mb-2 h-16" /><Skeleton className="h-16" /></> : null}
        {loadError ? <ErrorState title="Could not load fixtures" onRetry={() => { competitionsQuery.refetch(); fixturesQuery.refetch(); }} /> : null}
        {!loading && !loadError ? fixtures.map((fixture) => <FixtureRow key={fixture.providerId} fixture={fixture} teamForms={teamForms} />) : null}
        {!loading && !loadError && fixtures.length === 0 ? (
          <div className="pt-12 text-center text-[12px] text-zinc-500">No cached fixtures for this matchday. Run the football sync on the backend.</div>
        ) : null}

        <div className="mb-2 mt-4 flex items-center justify-between">
          <div className="text-[12px] font-bold tracking-wide text-zinc-400">FORM GUIDE (LAST 5 MATCHES)</div>
          {competition?.lastSyncedAt ? (
            <div className="flex items-center gap-1 text-[12px] text-zinc-600"><RefreshCw size={9} /> Synced {new Date(competition.lastSyncedAt).toLocaleString()}</div>
          ) : null}
        </div>
        <div className="mb-2 overflow-hidden rounded-xl border border-white/5 bg-white/[0.03]">
          {(standingsQuery.data?.standings ?? []).slice(0, 10).map((team) => (
            <div key={team.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-2 last:border-0">
              <span className="w-4 text-[12px] text-zinc-500">{team.position}</span>
              <span className="flex-1 text-[12px] font-medium text-white">{team.teamShortName ?? team.teamName}</span>
              <div className="flex gap-1">{team.form.map((result, index) => <FormBadge key={index} result={result} />)}</div>
              <span className="w-8 text-right text-[12px] font-bold text-white">{team.points}</span>
            </div>
          ))}
          {standingsQuery.isLoading ? <Skeleton className="m-3 h-24" /> : null}
          {standingsQuery.isError ? <div className="p-3 text-center text-[12px] text-zinc-500">Standings are not cached yet.</div> : null}
        </div>
      </div>
    </>
  );
}
