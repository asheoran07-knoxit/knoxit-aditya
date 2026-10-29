// artifacts/knoxit/src/components/Header.tsx
import { useState } from "react";
import { Link } from "wouter";
import { Menu, Coins } from "lucide-react";
import { Drawer } from "./Drawer";
import { BetaBadge, Logo } from "./Logo";
import { useGetChipBalanceQuery } from "../services/api/knoxitApi";

export function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const balanceQuery = useGetChipBalanceQuery();

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="-ml-3 flex h-11 w-11 items-center justify-center">
          <Menu size={22} className="text-zinc-300" />
        </button>
        <div className="flex items-center gap-1.5">
          <Link href="/" aria-label="Knoxit home" className="flex min-h-11 items-center">
            <Logo size={18} />
          </Link>
          <BetaBadge />
        </div>
        <div className="flex items-center gap-2.5">
          {/* Notifications bell hidden until there is a notifications list behind it. */}
          <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-1">
            <Coins size={12} className="text-amber-400" />
            <span
              className="text-amber-400 text-[12px] font-bold tabular-nums"
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
    <div className="flex items-center justify-between px-4 pt-2 pb-1">
      <button onClick={onBack} aria-label="Back" className="-ml-3 flex h-11 w-11 items-center justify-center text-[20px] text-zinc-300">←</button>
      <span className="min-w-0 truncate px-2 text-[15px] font-bold text-white">{title}</span>
      <div className="w-11 shrink-0" />
    </div>
  );
}
