// artifacts/knoxit/src/pages/ManageAdmins.tsx
// Route: /leagues/:id/manage-admins — creator-only screen
import { useState } from "react";
import { useRoute } from "wouter";
import { Shield, ShieldCheck } from "lucide-react";
import { SubHeader } from "../components/Header";
import { useAppSelector } from "../app/hooks";
import { canChangeAdminStatus } from "../domain/rules";
import { normalizeApiError } from "../services/api/error";
import { useGetFriendsLeagueMembersQuery, useSetFriendsLeagueAdminMutation } from "../services/api/knoxitApi";

export default function ManageAdmins() {
  const [, params] = useRoute("/leagues/:id/manage-admins");
  const leagueId = (params as { id?: string } | null)?.id ?? "";
  const currentUserId = useAppSelector((state) => state.auth.user?.id);
  const membersQuery = useGetFriendsLeagueMembersQuery(leagueId, { skip: !leagueId });
  const [setAdmin] = useSetFriendsLeagueAdminMutation();
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const members = membersQuery.data ?? [];
  const viewerIsCreator = members.some((m) => m.isCreator && m.userId === currentUserId);

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    setError(null);
    setSavingUserId(userId);
    try {
      await setAdmin({ leagueId, userId, isAdmin: !isAdmin }).unwrap();
    } catch (requestError) {
      setError(normalizeApiError(requestError).message);
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <>
      <SubHeader title="Manage Admins" onBack={() => window.history.back()} />
      <div className="px-4 pb-2 text-zinc-500 text-[11px]">
        Admins can approve or decline join requests alongside you. They can't delete the league or remove you.
        {membersQuery.isSuccess && !viewerIsCreator ? " Only the league creator can change who is an admin." : null}
      </div>
      {error ? <div className="mx-4 mb-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</div> : null}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 space-y-2">
        {membersQuery.isLoading ? <div className="pt-16 text-center text-[12px] text-zinc-500">Loading members…</div> : null}
        {membersQuery.isError ? (
          <div className="pt-16 text-center">
            <div className="text-[12px] text-red-300">Could not load league members.</div>
            <button onClick={() => membersQuery.refetch()} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[11px] text-zinc-300">Try again</button>
          </div>
        ) : null}
        {members.map((m) => (
          <div key={m.userId} className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-300">
                {m.username.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-white text-[13px] font-medium">
                  {m.username}{m.userId === currentUserId ? " (you)" : ""}
                </div>
                {m.isCreator && <div className="text-amber-400 text-[10px] font-semibold">Creator</div>}
              </div>
            </div>

            {m.isCreator ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-full px-2.5 py-1">
                <ShieldCheck size={11} /> Always admin
              </span>
            ) : (
              <button
                onClick={() => toggleAdmin(m.userId, m.isAdmin)}
                disabled={!canChangeAdminStatus({ isCreator: viewerIsCreator, targetIsCreator: m.isCreator }) || savingUserId !== null}
                className={`flex items-center gap-1 text-[10px] font-bold rounded-full px-2.5 py-1 border disabled:opacity-60 ${
                  m.isAdmin
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/25"
                    : "text-zinc-500 bg-white/[0.03] border-white/10"
                }`}
              >
                <Shield size={11} /> {savingUserId === m.userId ? "Saving…" : m.isAdmin ? "Admin" : "Make Admin"}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
