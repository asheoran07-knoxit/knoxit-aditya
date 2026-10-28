// artifacts/knoxit/src/components/Drawer.tsx
import { useLocation } from "wouter";
import {
  X, User, Bell, Gift, Users, HelpCircle, MessageCircleQuestion, LifeBuoy,
  FileText, Shield, Info, LogOut, ChevronRight,
  ShieldCheck, Coins,
} from "lucide-react";
import { ThemePicker } from "./ThemePicker";
import { useAppSelector } from "../app/hooks";
import { useGetChipBalanceQuery } from "../services/api/knoxitApi";

type DrawerProps = { open: boolean; onClose: () => void };

const sections: Array<{
  label: string;
  items: Array<{ label: string; icon: any; path: string; destructive?: boolean }>;
}> = [
  {
    label: "ACCOUNT",
    items: [
      { label: "Profile", icon: User, path: "/menu/profile" },
      { label: "Notifications", icon: Bell, path: "/menu/notifications" },
    ],
  },
  {
    label: "GROW",
    items: [
      { label: "Invite Friends", icon: Users, path: "/menu/invite" },
      { label: "Refer & Earn", icon: Gift, path: "/menu/refer" },
    ],
  },
  {
    label: "HELP",
    items: [
      { label: "How to Play", icon: HelpCircle, path: "/menu/how-to-play" },
      { label: "FAQ / Help Center", icon: MessageCircleQuestion, path: "/menu/faq" },
      { label: "Contact Support", icon: LifeBuoy, path: "/menu/support" },
    ],
  },
  {
    label: "LEGAL",
    items: [
      { label: "Terms & Conditions", icon: FileText, path: "/menu/terms" },
      { label: "Privacy Policy", icon: Shield, path: "/menu/privacy" },
    ],
  },
  {
    label: "OTHER",
    items: [
      { label: "About", icon: Info, path: "/menu/about" },
      { label: "Sign Out", icon: LogOut, path: "/menu/sign-out" },
    ],
  },
];

export function Drawer({ open, onClose }: DrawerProps) {
  const [, setLocation] = useLocation();
  const isOperationsAdmin = useAppSelector((state) => state.auth.user?.isOperationsAdmin === true);
  const username = useAppSelector((state) => state.auth.user?.username) ?? "…";
  const balanceQuery = useGetChipBalanceQuery(undefined, { skip: !open });

  if (!open) return null;

  const go = (path: string) => {
    onClose();
    setLocation(path);
  };

  return (
    <div className="absolute inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[280px] h-full bg-zinc-950 border-r border-white/10 overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <span className="text-white font-extrabold text-[16px] tracking-wide">KNOXIT</span>
          <button onClick={onClose}><X size={18} className="text-zinc-400" /></button>
        </div>

        <button onClick={() => go("/menu/profile")} className="w-full flex items-center gap-3 px-4 py-3 border-y border-white/5 mb-2 text-left">
          <div className="w-10 h-10 rounded-full bg-[var(--theme-primary-soft)] border border-[var(--theme-primary-border)] flex items-center justify-center text-[var(--theme-primary)] text-[12px] font-bold">
            {username.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-white text-[13px] font-semibold">{username}</div>
            <div className="text-zinc-500 text-[10px]">View profile</div>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-bold tabular-nums text-amber-400">
            <Coins size={11} />
            {balanceQuery.data ? balanceQuery.data.balance.toLocaleString() : balanceQuery.isLoading ? "…" : "—"}
          </span>
        </button>

        <ThemePicker />

        {isOperationsAdmin ? (
          <div className="px-2 mb-2">
            <div className="text-zinc-600 text-[9px] font-bold tracking-wider px-2.5 py-1.5">OPERATIONS</div>
            <button onClick={() => go("/operations")} className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg hover:bg-white/[0.03]">
              <ShieldCheck size={16} className="text-amber-400" />
              <span className="text-[13px] font-medium flex-1 text-left text-zinc-200">Admin Portal</span>
              <ChevronRight size={14} className="text-zinc-700" />
            </button>
          </div>
        ) : null}

        {sections.map((section) => (
          <div key={section.label} className="px-2 mb-2">
            <div className="text-zinc-600 text-[9px] font-bold tracking-wider px-2.5 py-1.5">{section.label}</div>
            {section.items.map((item) => (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg hover:bg-white/[0.03]"
              >
                <item.icon size={16} className={item.destructive ? "text-red-400" : "text-zinc-400"} />
                <span className={`text-[13px] font-medium flex-1 text-left ${item.destructive ? "text-red-400" : "text-zinc-200"}`}>
                  {item.label}
                </span>
                <ChevronRight size={14} className="text-zinc-700" />
              </button>
            ))}
          </div>
        ))}

        <div className="px-4 py-4 text-zinc-700 text-[10px]">Knoxit v0.1.0 (Beta)</div>
      </div>
    </div>
  );
}
