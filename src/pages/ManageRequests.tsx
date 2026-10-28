// artifacts/knoxit/src/pages/ManageRequests.tsx
// Route: /friends-leagues/requests
import { useState } from "react";
import { SubHeader } from "../components/Header";
import { normalizeApiError } from "../services/api/error";
import { useGetMyJoinRequestsQuery, useResolveJoinRequestMutation } from "../services/api/knoxitApi";

export default function ManageRequests() {
  const requestsQuery = useGetMyJoinRequestsQuery();
  const [resolveRequest] = useResolveJoinRequestMutation();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requests = requestsQuery.data ?? [];

  // The list refetches via the JoinRequest tag once the server confirms.
  const resolve = async (requestId: string, decision: "approve" | "decline") => {
    setError(null);
    setResolvingId(requestId);
    try {
      await resolveRequest({ requestId, decision }).unwrap();
    } catch (requestError) {
      setError(normalizeApiError(requestError).message);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <>
      <SubHeader title="Join Requests" onBack={() => window.history.back()} />
      <div className="px-4 pb-2 text-zinc-500 text-[11px]">People asking to join leagues you created or help run.</div>
      {error ? <div className="mx-4 mb-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</div> : null}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 space-y-2.5">
        {requestsQuery.isLoading ? <div className="text-center text-zinc-500 text-[12px] pt-16">Loading requests…</div> : null}
        {requestsQuery.isError ? (
          <div className="pt-16 text-center">
            <div className="text-[12px] text-red-300">Could not load join requests.</div>
            <button onClick={() => requestsQuery.refetch()} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[11px] text-zinc-300">Try again</button>
          </div>
        ) : null}
        {requestsQuery.isSuccess && requests.length === 0 && (
          <div className="text-center text-zinc-500 text-[12px] pt-16">No pending requests.</div>
        )}
        {requests.map((r) => (
          <div key={r.requestId} className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="text-white text-[13px] font-semibold">{r.requesterUsername}</div>
                <div className="text-zinc-500 text-[10px]">wants to join {r.leagueName}</div>
              </div>
            </div>
            {r.message && (
              <div className="bg-white/[0.03] border border-white/5 rounded-lg px-2.5 py-2 my-2 text-zinc-300 text-[12px] italic">
                "{r.message}"
              </div>
            )}
            <div className="flex gap-1.5 mt-2">
              <button
                onClick={() => resolve(r.requestId, "approve")}
                disabled={resolvingId !== null}
                className="text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
              >
                {resolvingId === r.requestId ? "Saving…" : "Approve"}
              </button>
              <button
                onClick={() => resolve(r.requestId, "decline")}
                disabled={resolvingId !== null}
                className="text-[11px] font-bold bg-white/5 text-zinc-400 border border-white/10 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
