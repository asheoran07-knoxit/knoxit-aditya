// artifacts/knoxit/src/pages/FriendsLeagues.tsx
// Routes: /friends-leagues (browse) and /friends-leagues/:id (request detail)
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ChevronRight, KeyRound } from "lucide-react";
import { SubHeader } from "../components/Header";
import { normalizeApiError } from "../services/api/error";
import {
  useGetLeaguesQuery,
  useGetPublicFriendsLeaguesQuery,
  useRequestFriendsLeagueMutation,
} from "../services/api/knoxitApi";

export function PublicFriendsLeaguesList() {
  const [, setLocation] = useLocation();
  const leaguesQuery = useGetPublicFriendsLeaguesQuery();
  const leagues = leaguesQuery.data ?? [];

  return (
    <>
      <SubHeader title="Friends Leagues" onBack={() => window.history.back()} />
      <div className="px-4 pb-2 flex items-center justify-between gap-2">
        <div className="text-zinc-500 text-[11px] flex-1">
          Public leagues created by other players. Money, if any, is arranged directly between members — Knoxit never handles it.
        </div>
      </div>
      <button
        onClick={() => setLocation("/friends-leagues/join-by-code")}
        className="mx-4 mb-3 flex items-center justify-center gap-1.5 bg-violet-500/10 border border-violet-500/30 text-violet-300 text-[12px] font-semibold rounded-xl py-2.5"
      >
        <KeyRound size={14} /> Join with a code instead
      </button>
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 space-y-2.5">
        {leaguesQuery.isLoading ? <div className="pt-12 text-center text-[12px] text-zinc-500">Loading leagues…</div> : null}
        {leaguesQuery.isError ? (
          <div className="pt-12 text-center">
            <div className="text-[12px] text-red-300">Could not load public leagues.</div>
            <button onClick={() => leaguesQuery.refetch()} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[11px] text-zinc-300">Try again</button>
          </div>
        ) : null}
        {leaguesQuery.isSuccess && leagues.length === 0 ? (
          <div className="pt-12 text-center text-[12px] text-zinc-500">No public friends leagues yet.</div>
        ) : null}
        {leagues.map((f) => (
          <button
            key={f.id}
            onClick={() => setLocation(f.alreadyJoined ? `/leagues/${f.id}` : `/friends-leagues/${f.id}`)}
            className="w-full text-left bg-white/[0.03] border border-white/10 rounded-xl p-3"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-white text-[13px] font-semibold">{f.name}</span>
              {f.alreadyJoined ? (
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">Joined</span>
              ) : f.hasPendingRequest ? (
                <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">Requested</span>
              ) : (
                <ChevronRight size={15} className="text-zinc-600" />
              )}
            </div>
            <div className="text-zinc-500 text-[10px] mb-2">by {f.creatorUsername} · {f.memberCount} members</div>
            {f.entryTerms ? <div className="text-zinc-400 text-[11px] leading-snug line-clamp-2">{f.entryTerms}</div> : null}
          </button>
        ))}
      </div>
    </>
  );
}

export function FriendsLeagueRequestDetail() {
  const [, params] = useRoute("/friends-leagues/:id");
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const routeId = ((params as { id?: string } | null)?.id) ?? "";
  const leaguesQuery = useGetPublicFriendsLeaguesQuery();
  const myLeaguesQuery = useGetLeaguesQuery();
  const [requestToJoin, requestState] = useRequestFriendsLeagueMutation();
  const league = leaguesQuery.data?.find((f) => f.id === routeId);
  // The public listing never exposes invite codes; members read theirs from /mine.
  const inviteCode = myLeaguesQuery.data?.find((l) => l.id === routeId)?.inviteCode ?? null;

  if (leaguesQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">Loading league…</div>;
  }
  if (!league) {
    return (
      <>
        <SubHeader title="Friends League" onBack={() => window.history.back()} />
        <div className="flex-1 px-6 pt-16 text-center">
          <div className="text-[12px] text-zinc-400">This league isn't public or no longer exists.</div>
          <button onClick={() => setLocation("/friends-leagues")} className="mt-4 text-[12px] font-semibold text-emerald-400">Browse friends leagues</button>
        </div>
      </>
    );
  }

  const creatorFirstName = league.creatorUsername.split(" ")[0];
  const submitRequest = async () => {
    setRequestError(null);
    try {
      await requestToJoin({ leagueId: league.id, message: message.trim() || undefined }).unwrap();
    } catch (error) {
      setRequestError(normalizeApiError(error).message);
    }
  };

  return (
    <>
      <SubHeader title={league.name} onBack={() => window.history.back()} />
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2">
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 mb-4">
          <div className="text-zinc-500 text-[10px] mb-1">CREATED BY</div>
          <div className="text-white text-[14px] font-semibold mb-3">{league.creatorUsername}</div>
          <div className="text-zinc-500 text-[10px] mb-1">MEMBERS</div>
          <div className="text-white text-[14px] font-semibold">{league.memberCount} joined</div>
        </div>

        {league.alreadyJoined && inviteCode && (
          <div className="bg-violet-500/[0.06] border border-violet-500/25 rounded-xl p-4 mb-4">
            <div className="text-violet-300 text-[10px] font-bold mb-1.5">INVITE CODE</div>
            <div className="flex items-center justify-between">
              <span className="text-white text-[20px] font-extrabold tracking-[0.2em]">{inviteCode}</span>
              <span className="text-[10px] text-zinc-500">Share this — instant join, no approval needed</span>
            </div>
          </div>
        )}

        <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl p-4 mb-4">
          <div className="text-amber-400 text-[10px] font-bold mb-1.5">ENTRY TERMS (set by creator)</div>
          <div className="text-zinc-200 text-[12px] leading-relaxed">{league.entryTerms || "No entry terms written."}</div>
        </div>

        <div className="text-zinc-500 text-[10px] leading-relaxed px-1 mb-4">
          Knoxit only displays what the creator wrote here — we don't set, collect, or process any money.
          Any arrangement is directly between members.
        </div>

        {!league.alreadyJoined && !league.hasPendingRequest && (
          <>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">
              MESSAGE TO {creatorFirstName.toUpperCase()} <span className="text-zinc-600 font-normal">(optional)</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. I'm in, ready to send my share!"
              maxLength={200}
              rows={2}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-white text-[13px] placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 resize-none"
            />
          </>
        )}
        {requestError ? <div className="mt-2 text-center text-[11px] text-red-400">{requestError}</div> : null}
      </div>
      <div className="px-4 pb-4">
        {league.alreadyJoined ? (
          <button
            onClick={() => setLocation(`/leagues/${league.id}`)}
            className="w-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-semibold text-[13px] rounded-xl py-3 text-center"
          >
            You're a member — open league
          </button>
        ) : !league.hasPendingRequest ? (
          <button
            onClick={submitRequest}
            disabled={requestState.isLoading}
            className="w-full bg-emerald-500 text-black font-bold text-[13px] rounded-xl py-3 disabled:opacity-60"
          >
            {requestState.isLoading ? "Sending…" : "Request to Join"}
          </button>
        ) : (
          <div className="w-full bg-white/5 border border-white/10 text-zinc-300 font-semibold text-[13px] rounded-xl py-3 text-center">
            Request Sent — waiting on {creatorFirstName}
          </div>
        )}
      </div>
    </>
  );
}
