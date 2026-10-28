// artifacts/knoxit/src/components/Header.tsx
import { useState } from "react";
import { Link } from "wouter";
import { Menu, Bell, Coins } from "lucide-react";
import { Drawer } from "./Drawer";
import { BetaBadge, Logo } from "./Logo";
import { useGetChipBalanceQuery } from "../services/api/knoxitApi";

export function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const balanceQuery = useGetChipBalanceQuery();

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <button onClick={() => setDrawerOpen(true)}>
          <Menu size={20} className="text-zinc-300" />
        </button>
        <div className="flex items-center gap-1.5">
          <Link href="/" aria-label="Knoxit home">
            <Logo size={18} />
          </Link>
          <BetaBadge />
        </div>
        <div className="flex items-center gap-2.5">
          <Bell size={18} className="text-zinc-300" />
          <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-1">
            <Coins size={12} className="text-amber-400" />
            <span
              className="text-amber-400 text-[11px] font-bold tabular-nums"
              aria-label={balanceQuery.isLoading ? "Loading chip balance" : "Chip balance"}
              title={balanceQuery.isError ? "Chip balance unavailable" : undefined}
            >
              {balanceQuery.data ? balanceQuery.data.balance.toLocaleString() : balanceQuery.isLoading ? "…" : "—"}
            </span>
          </div>
        </div>
      </div>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}

export function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-3">
      <button onClick={onBack} className="text-zinc-300 text-[18px]">←</button>
      <span className="text-white font-bold text-[15px]">{title}</span>
      <div className="w-[18px]" />
    </div>
  );
}
