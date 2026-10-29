// artifacts/knoxit/src/pages/menu/Profile.tsx
// Route: /menu/profile
import { useLocation } from "wouter";
import { LogOut, ChevronRight } from "lucide-react";
import { SubHeader } from "../../components/Header";
import { useAppSelector } from "../../app/hooks";
import { useGetChipBalanceQuery } from "../../services/api/knoxitApi";

export default function Profile() {
  const [, setLocation] = useLocation();
  const user = useAppSelector((state) => state.auth.user);
  const balanceQuery = useGetChipBalanceQuery();
  const username = user?.username ?? "…";

  return (
    <>
      <SubHeader title="Profile" onBack={() => window.history.back()} />
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 pb-4">
        <div className="flex flex-col items-center py-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-400/50 flex items-center justify-center text-emerald-300 text-[18px] font-bold mb-2">
            {username.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-white text-[16px] font-bold">{username}</div>
          {user?.email ? <div className="text-zinc-500 text-[12px]">{user.email}</div> : null}
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl divide-y divide-white/5 mb-4">
          <div className="px-3 py-2.5 flex items-center justify-between">
            <span className="text-zinc-400 text-[12px]">Username</span>
            <span className="text-white text-[12px] font-medium">{username}</span>
          </div>
          <div className="px-3 py-2.5 flex items-center justify-between">
            <span className="text-zinc-400 text-[12px]">Chip Balance</span>
            <span className="text-amber-400 text-[12px] font-bold tabular-nums">
              {balanceQuery.data ? balanceQuery.data.balance.toLocaleString() : balanceQuery.isLoading ? "…" : "—"}
            </span>
          </div>
        </div>

        <button
          onClick={() => setLocation("/menu/sign-out")}
          className="w-full flex items-center gap-2.5 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-3"
        >
          <LogOut size={16} className="text-zinc-400" />
          <span className="text-zinc-200 text-[13px] font-medium flex-1 text-left">Sign Out</span>
          <ChevronRight size={14} className="text-zinc-700" />
        </button>
      </div>
    </>
  );
}
