// Route: /friends-leagues/join-by-code
import { useState } from "react";
import { useLocation } from "wouter";
import { KeyRound } from "lucide-react";
import { SubHeader } from "../components/Header";
import { normalizeApiError } from "../services/api/error";
import { useJoinByCodeMutation } from "../services/api/knoxitApi";

function normalizeInviteCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
}

export default function JoinByCode() {
  const [, setLocation] = useLocation();
  const [joinByCode, { isLoading }] = useJoinByCodeMutation();
  const [code, setCode] = useState(() => normalizeInviteCode(new URLSearchParams(window.location.search).get("code") ?? ""));
  const [state, setState] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async () => {
    try {
      const result = await joinByCode({ inviteCode: normalizeInviteCode(code) }).unwrap();
      const leagueId = result.leagueId ?? result.league?.id ?? result.id;
      const leagueName = result.league?.name ?? result.name;

      setState("success");
      setMessage(leagueName ? `You're in! Welcome to ${leagueName}.` : "You're in!");
      setTimeout(() => setLocation(leagueId ? `/leagues/${leagueId}` : "/friends-leagues"), 1200);
    } catch (error) {
      // The server explains 4xx rejections, e.g. "This league has already started".
      const normalized = normalizeApiError(error);
      setState("error");
      setMessage(typeof normalized.status === "number" && normalized.status < 500
        ? normalized.message
        : "We could not join with that code. Please try again.");
    }
  };

  return (
    <>
      <SubHeader title="Join with Code" onBack={() => window.history.back()} />
      <div className="flex-1 flex flex-col px-4 pt-6">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-full bg-[var(--theme-primary-soft)] border border-[var(--theme-primary-border)] flex items-center justify-center mb-3">
            <KeyRound size={24} className="text-[var(--theme-primary)]" />
          </div>
          <div className="text-white text-[15px] font-semibold text-center">Got an invite code?</div>
          <div className="text-zinc-500 text-[11px] text-center mt-1 max-w-[240px]">
            Enter the code your friend shared to join their league instantly, no approval needed.
          </div>
        </div>

        <input
          value={code}
          onChange={(e) => {
            setCode(normalizeInviteCode(e.target.value));
            setState("idle");
          }}
          placeholder="e.g. GULLY7"
          maxLength={12}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-center text-white text-[16px] font-bold tracking-[0.2em] placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-normal focus:outline-none focus:border-[var(--theme-primary-ring)]"
        />

        {state === "error" && (
          <div className="mt-3 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 text-red-400 text-[12px] text-center">
            {message}
          </div>
        )}
        {state === "success" && (
          <div className="mt-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2 text-emerald-400 text-[12px] text-center">
            {message}
          </div>
        )}

        <button
          onClick={submit}
          disabled={normalizeInviteCode(code).length < 4 || isLoading}
          className="w-full mt-4 bg-[var(--theme-primary)] disabled:bg-white/5 disabled:text-zinc-600 text-[var(--theme-primary-text)] font-bold text-[13px] rounded-xl py-3"
        >
          {isLoading ? "Joining..." : "Join League"}
        </button>
      </div>
    </>
  );
}
