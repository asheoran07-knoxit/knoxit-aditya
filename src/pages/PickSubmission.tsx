import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clock, Info, Loader2, ShieldCheck } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { SubHeader } from "../components/Header";
import { normalizeApiError } from "../services/api/error";
import { type PickRecord, useGetPickOptionsQuery, useSubmitPickMutation } from "../services/api/knoxitApi";
import { choosePrimary, isBackupSelectable } from "../features/picks/pickSelection";

type Step = "select" | "review" | "success";

function localLockLabel(locksAt: string | null) {
  if (!locksAt) return "Lock time unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(locksAt));
}

export default function PickSubmission() {
  const [, params] = useRoute("/picks/submit/:leagueId");
  const [, setLocation] = useLocation();
  const leagueId = (params as { leagueId?: string } | null)?.leagueId;
  const optionsQuery = useGetPickOptionsQuery(leagueId ?? "", { skip: !leagueId, refetchOnMountOrArgChange: true });
  const [submitPick, submitState] = useSubmitPickMutation();
  const [primary, setPrimary] = useState<string | null>(null);
  const [backup, setBackup] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [showBackupInfo, setShowBackupInfo] = useState(false);
  const [savedWasUpdate, setSavedWasUpdate] = useState(false);
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
    return <div className="flex flex-1 items-center justify-center text-sm text-red-300">Invalid league link</div>;
  }

  if (optionsQuery.isLoading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">Loading available teams…</div>;
  }

  if (optionsQuery.isError || !optionsQuery.data) {
    const message = optionsQuery.error ? normalizeApiError(optionsQuery.error).message : "Pick options could not be loaded";
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
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

    // Decided now: after saving, the refetched options already contain the
    // new pick, so `isEditing` would wrongly read true for a first pick.
    const editingExistingPick = isEditing;
    try {
      const response = await submitPick(request).unwrap();
      setSavedPick(response.pick);
      setSavedWasUpdate(response.updated || (response.replayed && editingExistingPick));
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
            setSavedWasUpdate(editingExistingPick);
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
        <SubHeader title={savedWasUpdate ? "Pick Updated" : "Pick Confirmed"} onBack={() => setLocation(`/leagues/${leagueId}`)} />
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
            <div className="mt-1 text-[10px] text-zinc-500">You can change your pick until then.</div>
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
          <button
            onClick={() => void save()}
            disabled={submitState.isLoading || !options.canSubmit}
            aria-busy={submitState.isLoading}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-extrabold text-black disabled:opacity-60"
          >
            {submitState.isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Confirming with server…
              </>
            ) : isEditing ? "Confirm Updated Pick" : "Confirm Pick"}
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
                  const next = choosePrimary(team.name, backup);
                  setPrimary(next.primary);
                  setBackup(next.backup);
                  setBackupNotice(next.notice);
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

        <div className="mb-1 flex items-center gap-1.5">
          <label className="text-[11px] font-semibold text-zinc-400">BACKUP PICK <span className="font-normal text-zinc-600">— optional</span></label>
          <button
            onClick={() => setShowBackupInfo((open) => !open)}
            aria-label="Why have a backup?"
            aria-expanded={showBackupInfo}
            className="text-zinc-500"
          >
            <Info size={13} />
          </button>
        </div>
        <div className="mb-2 text-[10px] leading-snug text-zinc-500">
          Your backup is only used if your primary team's match is postponed or abandoned. If your primary team loses or draws, you're out — the backup doesn't save you.
        </div>
        {showBackupInfo ? (
          <div className="mb-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] leading-snug text-zinc-300">
            <div className="font-semibold text-white">Why have a backup?</div>
            <div>Matches sometimes get postponed (weather, cup clashes, safety).</div>
            <div>Without a backup, a postponed match leaves your pick undecided.</div>
            <div>With one, you're judged on your backup team's result instead.</div>
          </div>
        ) : null}
        {backupNotice ? (
          <div role="status" className="mb-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
            {backupNotice}
          </div>
        ) : null}
        <div className="mb-5 grid grid-cols-2 gap-2">
          {options.teams.map((team) => {
            const selected = backup === team.name;
            const unavailable = team.used || !isBackupSelectable(team.name, primary) || !options.canSubmit;
            return (
              <button
                key={`backup-${team.id ?? team.name}`}
                onClick={() => {
                  setBackup(selected ? null : team.name);
                  setBackupNotice(null);
                }}
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
