import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clock, ShieldCheck } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { SubHeader } from "../components/Header";
import { normalizeApiError } from "../services/api/error";
import { type PickRecord, useGetPickOptionsQuery, useSubmitPickMutation } from "../services/api/knoxitApi";

type Step = "select" | "review" | "success";

function localLockLabel(locksAt: string | null) {
  if (!locksAt) return "Lock time unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(locksAt));
}

export default function PickSubmission() {
  const [, params] = useRoute("/picks/submit/:leagueId");
  const [, setLocation] = useLocation();
  const leagueId = (params as { leagueId?: string } | null)?.leagueId;
  const optionsQuery = useGetPickOptionsQuery(leagueId ?? "", { skip: !leagueId });
  const [submitPick, submitState] = useSubmitPickMutation();
  const [primary, setPrimary] = useState<string | null>(null);
  const [backup, setBackup] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("select");
  const [error, setError] = useState<string>();
  const [savedPick, setSavedPick] = useState<PickRecord>();
  const [verifiedAfterNetworkFailure, setVerifiedAfterNetworkFailure] = useState(false);
  const initializedKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!optionsQuery.data) return;
    const key = `${optionsQuery.data.gameweek}:${optionsQuery.data.currentPick?.id ?? "new"}`;
    if (initializedKey.current === key) return;
    initializedKey.current = key;
    setPrimary(optionsQuery.data.currentPick?.primaryTeam ?? null);
    setBackup(optionsQuery.data.currentPick?.backupTeam ?? null);
  }, [optionsQuery.data]);

  if (!leagueId) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-red-300">Invalid league link</div>;
  }

  if (optionsQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">Loading available teams…</div>;
  }

  if (optionsQuery.isError || !optionsQuery.data) {
    const message = optionsQuery.error ? normalizeApiError(optionsQuery.error).message : "Pick options could not be loaded";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <AlertCircle className="mb-3 text-red-400" size={28} />
        <div className="text-sm font-semibold text-white">Unable to prepare your pick</div>
        <div className="mt-1 text-xs text-zinc-500">{message}</div>
        <button onClick={() => optionsQuery.refetch()} className="mt-4 rounded-lg border border-white/10 px-4 py-2 text-xs text-zinc-300">Try again</button>
        <button onClick={() => setLocation(`/leagues/${leagueId}`)} className="mt-2 px-4 py-2 text-xs text-emerald-400">Back to League</button>
      </div>
    );
  }

  const options = optionsQuery.data;
  const isEditing = options.currentPick !== null;
  const selectedPrimary = options.teams.find((team) => team.name === primary);
  const selectedBackup = options.teams.find((team) => team.name === backup);

  const save = async () => {
    if (!primary || !options.canSubmit) return;
    setError(undefined);
    setVerifiedAfterNetworkFailure(false);
    const request = {
      leagueId,
      gameweek: options.gameweek,
      primaryTeam: primary,
      ...(backup ? { backupTeam: backup } : {}),
    };

    try {
      const response = await submitPick(request).unwrap();
      setSavedPick(response.pick);
      setStep("success");
    } catch (requestError) {
      const normalized = normalizeApiError(requestError);
      if (normalized.status === "FETCH_ERROR" || normalized.status === "PARSING_ERROR") {
        try {
          const verified = await optionsQuery.refetch().unwrap();
          if (
            verified.currentPick?.primaryTeam === request.primaryTeam
            && verified.currentPick.backupTeam === (request.backupTeam ?? null)
          ) {
            setSavedPick(verified.currentPick);
            setVerifiedAfterNetworkFailure(true);
            setStep("success");
            return;
          }
        } catch {
          // Keep the original network error when verification also fails.
        }
      }
      setError(normalized.message);
    }
  };

  if (step === "success" && savedPick) {
    return (
      <>
        <SubHeader title={isEditing ? "Pick Updated" : "Pick Submitted"} onBack={() => setLocation(`/leagues/${leagueId}`)} />
        <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15">
            <Check size={26} className="text-emerald-400" />
          </div>
          <div className="text-base font-bold text-white">Your GW{savedPick.gameweek} pick is confirmed.</div>
          <div className="mt-3 w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left">
            <div className="text-sm font-bold text-white">Primary: {savedPick.primaryTeam}</div>
            <div className="mt-1 text-xs text-zinc-400">Backup: {savedPick.backupTeam ?? "None"}</div>
          </div>
          {verifiedAfterNetworkFailure ? (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400"><ShieldCheck size={14} /> Confirmed from the server after the connection was interrupted.</div>
          ) : null}
          <button onClick={() => setLocation(`/leagues/${leagueId}`)} className="mt-5 w-full max-w-sm rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-black">Return to League</button>
        </div>
      </>
    );
  }

  if (step === "review") {
    return (
      <>
        <SubHeader title="Review Your Pick" onBack={() => setStep("select")} />
        <main className="flex-1 overflow-y-auto px-4 pb-5 pt-3">
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.07] p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-red-300"><Clock size={14} /> Locks {localLockLabel(options.locksAt)}</div>
            <div className="mt-1 text-[10px] text-zinc-500">The server rejects every new or edited pick after this time.</div>
          </div>
          <section className="mt-4 space-y-3">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4">
              <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">Primary pick</div>
              <div className="mt-1 text-lg font-extrabold text-white">{selectedPrimary?.name}</div>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
              <div className="text-[10px] font-bold uppercase tracking-wide text-amber-400">Backup pick</div>
              <div className="mt-1 text-lg font-extrabold text-white">{selectedBackup?.name ?? "No backup selected"}</div>
              <div className="mt-1 text-[10px] text-zinc-500">Used only if the primary match has no result.</div>
            </div>
          </section>
          {error ? <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}
          <button onClick={() => void save()} disabled={submitState.isLoading || !options.canSubmit} className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-black disabled:opacity-50">
            {submitState.isLoading ? "Confirming with server…" : isEditing ? "Confirm Updated Pick" : "Confirm Pick"}
          </button>
          <button onClick={() => setStep("select")} disabled={submitState.isLoading} className="mt-2 w-full rounded-xl border border-white/10 py-3 text-xs font-semibold text-zinc-300">Change Selection</button>
        </main>
      </>
    );
  }

  return (
    <>
      <SubHeader title={isEditing ? `Edit GW${options.gameweek} Pick` : `Make GW${options.gameweek} Pick`} onBack={() => setLocation(`/leagues/${leagueId}`)} />
      <main className="flex-1 overflow-y-auto px-4 pb-5 pt-2">
        <div className="mb-4 flex items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-[10px] text-zinc-400">
          <Clock size={12} /> Pick window closes {localLockLabel(options.locksAt)}
        </div>
        {!options.canSubmit ? (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-3 text-xs text-red-200">The pick window is closed. Your existing pick cannot be changed.</div>
        ) : null}
        {!options.teams.length ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-xs text-amber-200">Team data is not available yet. Run the fixture sync and try again.</div>
        ) : null}

        <label className="mb-2 block text-[11px] font-semibold text-zinc-400">PRIMARY PICK</label>
        <div className="mb-5 grid grid-cols-2 gap-2">
          {options.teams.map((team) => {
            const selected = primary === team.name;
            const unavailable = team.used || !options.canSubmit;
            return (
              <button
                key={`primary-${team.id ?? team.name}`}
                onClick={() => {
                  setPrimary(team.name);
                  if (backup === team.name) setBackup(null);
                }}
                disabled={unavailable}
                className={`flex min-h-12 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold ${unavailable ? "border-white/5 bg-white/[0.02] text-zinc-700 line-through" : selected ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/[0.03] text-zinc-300"}`}
              >
                {team.crest ? <img src={team.crest} alt="" className="h-6 w-6 object-contain" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-[9px]">{team.name.slice(0, 1)}</span>}
                <span>{team.shortName ?? team.name}</span>
              </button>
            );
          })}
        </div>

        <label className="mb-2 block text-[11px] font-semibold text-zinc-400">BACKUP PICK <span className="font-normal text-zinc-600">— optional</span></label>
        <div className="mb-5 grid grid-cols-2 gap-2">
          {options.teams.map((team) => {
            const selected = backup === team.name;
            const unavailable = team.used || team.name === primary || !options.canSubmit;
            return (
              <button
                key={`backup-${team.id ?? team.name}`}
                onClick={() => setBackup(selected ? null : team.name)}
                disabled={unavailable}
                className={`flex min-h-12 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold ${unavailable ? "border-white/5 bg-white/[0.02] text-zinc-700 line-through" : selected ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/[0.03] text-zinc-300"}`}
              >
                {team.crest ? <img src={team.crest} alt="" className="h-6 w-6 object-contain" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-[9px]">{team.name.slice(0, 1)}</span>}
                <span>{team.shortName ?? team.name}</span>
              </button>
            );
          })}
        </div>

        {error ? <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}
        <button onClick={() => { setError(undefined); setStep("review"); }} disabled={!primary || !options.canSubmit} className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-black disabled:bg-white/5 disabled:text-zinc-600">Review Pick</button>
      </main>
    </>
  );
}
