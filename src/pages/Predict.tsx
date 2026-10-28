// Route: /predict/:leagueId — predict every score in the gameweek.
import { Fragment, useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Lock, Minus, Plus } from "lucide-react";
import { SubHeader } from "../components/Header";
import { normalizeApiError } from "../services/api/error";
import {
  type PredictorMatch,
  type PredictorTeam,
  useGetPredictorGameweekQuery,
  useSavePredictionsMutation,
} from "../services/api/knoxitApi";
import {
  changedPredictions,
  countPredicted,
  draftFromMatches,
  stepScore,
  toggleBooster,
  type Draft,
} from "../features/predictor/predictDraft";

const teamName = (team: PredictorTeam) => team.shortName ?? team.name;

function formatDay(iso: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}

function formatKickoff(iso: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function Crest({ team }: { team: PredictorTeam }) {
  return team.crest
    ? <img src={team.crest} alt="" className="h-6 w-6 shrink-0 object-contain" />
    : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-zinc-300">{team.name.slice(0, 1)}</span>;
}

function Stepper({ value, onStep, disabled, label }: { value: number | null; onStep: (delta: 1 | -1) => void; disabled: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1" aria-label={label}>
      <button onClick={() => onStep(-1)} disabled={disabled} aria-label={`${label} minus one`} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-zinc-300 disabled:opacity-30">
        <Minus size={12} />
      </button>
      <span className="w-6 text-center text-[16px] font-extrabold tabular-nums text-white">{value ?? "–"}</span>
      <button onClick={() => onStep(1)} disabled={disabled} aria-label={`${label} plus one`} className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-zinc-300 disabled:opacity-30">
        <Plus size={12} />
      </button>
    </div>
  );
}

function outcomeLabel(match: PredictorMatch) {
  const mine = match.myPrediction;
  if (!mine) return "No prediction";
  if (mine.outcome === "void") return "Void — match not played";
  if (mine.points === null) return null;
  const what = mine.outcome === "exact" ? "Exact score" : mine.outcome === "result" ? "Right result" : "Wrong";
  return `${what} · ${mine.points} pt${mine.points === 1 ? "" : "s"}`;
}

export default function Predict() {
  const [, params] = useRoute("/predict/:leagueId");
  const [, setLocation] = useLocation();
  const leagueId = (params as { leagueId?: string } | null)?.leagueId ?? "";
  const [gameweek, setGameweek] = useState<number | undefined>(undefined);
  const query = useGetPredictorGameweekQuery({ leagueId, gameweek }, { skip: !leagueId, refetchOnMountOrArgChange: true });
  const [savePredictions, saveState] = useSavePredictionsMutation();
  const [draft, setDraft] = useState<Draft>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // True from a successful save until the next edit: the refreshed gameweek
  // takes a moment to arrive, and the saved picks shouldn't flash as unsaved.
  const [justSaved, setJustSaved] = useState(false);
  const loadedKey = useRef<string | null>(null);

  const data = query.data;
  // Start from the server's predictions whenever a gameweek (re)loads cleanly.
  useEffect(() => {
    if (!data) return;
    const key = `${data.gameweek}:${data.matches.map((match) => `${match.fixtureId}-${match.myPrediction?.homeGoals}-${match.myPrediction?.awayGoals}-${match.myPrediction?.booster}-${match.locked}`).join("|")}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    setDraft(draftFromMatches(data.matches));
  }, [data]);

  if (query.isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">Loading matches…</div>;
  if (query.isError || !data) {
    const message = query.error ? normalizeApiError(query.error).message : "Matches could not be loaded";
    return (
      <>
        <SubHeader title="Predict" onBack={() => setLocation(`/leagues/${leagueId}`)} />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <AlertCircle className="mb-3 text-red-400" size={28} />
          <div className="text-sm font-semibold text-white">Unable to open predictions</div>
          <div className="mt-1 text-xs text-zinc-500">{message}</div>
          <button onClick={() => query.refetch()} className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-xs text-zinc-300">Try again</button>
        </div>
      </>
    );
  }

  const changes = justSaved && query.isFetching ? [] : changedPredictions(draft, data.matches);
  const predicted = countPredicted(draft, data.matches);
  const edit = (update: (current: Draft) => Draft) => {
    setJustSaved(false);
    setNotice(null);
    setDraft(update);
  };

  const save = async () => {
    setError(null);
    setNotice(null);
    try {
      const result = await savePredictions({ leagueId, gameweek: data.gameweek, predictions: changes }).unwrap();
      setJustSaved(true);
      setNotice(`Saved ${result.saved} prediction${result.saved === 1 ? "" : "s"} ✓`);
    } catch (requestError) {
      setError(normalizeApiError(requestError).message);
      void query.refetch();
    }
  };

  const goTo = (target: number) => {
    setError(null);
    setNotice(null);
    setGameweek(target);
  };

  return (
    <>
      <SubHeader title={data.leagueName} onBack={() => setLocation(`/leagues/${leagueId}`)} />
      <div className="flex items-center justify-between px-4 pb-2">
        <button onClick={() => goTo(data.gameweek - 1)} disabled={data.gameweek <= data.startingRound} aria-label="Previous gameweek" className="text-zinc-400 disabled:opacity-20">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <div className="text-[14px] font-bold text-white">GW{data.gameweek}</div>
          <div className="text-[10px] text-zinc-500">Mini-season GW{data.startingRound}–{data.endGameweek}</div>
        </div>
        <button onClick={() => goTo(data.gameweek + 1)} disabled={data.gameweek >= data.endGameweek} aria-label="Next gameweek" className="text-zinc-400 disabled:opacity-20">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="px-4 pb-2 text-[10px] leading-snug text-zinc-500">
        Exact score 5 pts · right result 3 · each match locks 1 hour before kickoff. One Joker (double points) and one Wildcard (2 pts if wrong) per gameweek.
      </div>

      <main className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
        {data.matches.length === 0 ? <div className="pt-10 text-center text-[12px] text-zinc-500">No matches in this gameweek yet.</div> : null}
        {data.matches.map((match, index) => {
          const day = formatDay(match.kickoff);
          const dayHeader = index === 0 || formatDay(data.matches[index - 1].kickoff) !== day
            ? <div className="pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">{day}</div>
            : null;
          const entry = draft[match.fixtureId] ?? { home: null, away: null, booster: null };
          const readOnly = match.locked || !data.canEdit;
          const result = outcomeLabel(match);
          return (
            <Fragment key={match.fixtureId}>
            {dayHeader}
            <section
              data-fixture-id={match.fixtureId}
              className={`rounded-xl border p-3 ${match.locked ? "border-white/5 bg-white/[0.015] opacity-80" : "border-white/10 bg-white/[0.03]"}`}
            >
              <div className="mb-2 flex items-center justify-between text-[10px] text-zinc-500">
                <span>{formatKickoff(match.kickoff)}</span>
                {match.locked ? (
                  <span className="flex items-center gap-1 font-semibold text-zinc-400"><Lock size={10} /> Locked</span>
                ) : (
                  <span>Locks {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(match.locksAt))}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Crest team={match.home} />
                  <span className="truncate text-[12px] font-semibold text-white">{teamName(match.home)}</span>
                </div>
                <Stepper value={entry.home} disabled={readOnly} label={`${teamName(match.home)} goals`} onStep={(delta) => edit((current) => stepScore(current, match.fixtureId, "home", delta))} />
                <span className="text-zinc-600">–</span>
                <Stepper value={entry.away} disabled={readOnly} label={`${teamName(match.away)} goals`} onStep={(delta) => edit((current) => stepScore(current, match.fixtureId, "away", delta))} />
                <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                  <span className="truncate text-right text-[12px] font-semibold text-white">{teamName(match.away)}</span>
                  <Crest team={match.away} />
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                {(["joker", "wildcard"] as const).map((booster) => (
                  <button
                    key={booster}
                    onClick={() => {
                      const result = toggleBooster(draft, data.matches, match.fixtureId, booster, data.allowance[booster]);
                      edit(() => result.draft);
                      setError(result.error);
                    }}
                    disabled={readOnly}
                    aria-pressed={entry.booster === booster}
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold disabled:opacity-40 ${
                      entry.booster === booster
                        ? booster === "joker" ? "border-amber-400/60 bg-amber-500/20 text-amber-300" : "border-sky-400/60 bg-sky-500/20 text-sky-300"
                        : "border-white/10 text-zinc-500"
                    }`}
                  >
                    {booster === "joker" ? "Joker ×2" : "Wildcard"}
                  </button>
                ))}
                {match.homeScore !== null && match.awayScore !== null ? (
                  <span className="ml-auto text-[11px] font-semibold text-zinc-300">FT {match.homeScore}–{match.awayScore}</span>
                ) : null}
              </div>

              {match.locked ? (
                <div className="mt-2 border-t border-white/5 pt-2 text-[10px] leading-snug">
                  {result ? <div className="mb-1 font-semibold text-zinc-300">{result}</div> : null}
                  {match.revealed.length ? (
                    <div className="text-zinc-500">
                      {match.revealed.map((row) => `${row.username} ${row.homeGoals}–${row.awayGoals}${row.booster === "joker" ? " (J)" : row.booster === "wildcard" ? " (W)" : ""}`).join(" · ")}
                    </div>
                  ) : (
                    <div className="text-zinc-600">Nobody predicted this match.</div>
                  )}
                </div>
              ) : null}
            </section>
            </Fragment>
          );
        })}
      </main>

      {data.canEdit && data.matches.some((match) => !match.locked) ? (
        <div className="border-t border-white/5 bg-zinc-950 px-4 pb-2 pt-2">
          {error ? <div role="alert" className="mb-1.5 text-[11px] text-red-300">{error}</div> : null}
          {notice ? <div role="status" className="mb-1.5 text-[11px] text-emerald-300">{notice}</div> : null}
          <div className="flex items-center gap-3">
            <div className="flex-1 text-[12px] text-zinc-300">
              <span className="font-bold text-white">{predicted}</span> of {data.matches.length} predicted
              {changes.length ? <span className="block text-[10px] text-amber-400">{changes.length} unsaved change{changes.length === 1 ? "" : "s"}</span> : null}
            </div>
            <button
              onClick={() => void save()}
              disabled={changes.length === 0 || saveState.isLoading}
              aria-busy={saveState.isLoading}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-[13px] font-extrabold text-black disabled:opacity-40"
            >
              {saveState.isLoading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
              Save predictions
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
