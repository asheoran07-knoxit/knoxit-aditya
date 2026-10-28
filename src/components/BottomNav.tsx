// artifacts/knoxit/src/components/BottomNav.tsx
import { useLocation } from "wouter";
import { Home as HomeIcon, Trophy, Target, Calendar, ShoppingBag } from "lucide-react";

const items = [
  { path: "/", icon: HomeIcon, label: "Home" },
  { path: "/my-leagues", icon: Trophy, label: "My Leagues" },
  { path: "/picks", icon: Target, label: "Picks" },
  { path: "/fixtures", icon: Calendar, label: "Fixtures" },
  { path: "/shop", icon: ShoppingBag, label: "Shop" },
];

// Highlights the section a nested screen belongs to, e.g. a league's detail
// page under My Leagues and pick submission under Picks.
function isActive(itemPath: string, location: string) {
  if (itemPath === "/") return location === "/";
  if (itemPath === "/my-leagues") {
    return location === "/my-leagues" || location.startsWith("/leagues/") || location.startsWith("/friends-leagues");
  }
  return location === itemPath || location.startsWith(`${itemPath}/`);
}

export function BottomNav() {
  const [location, setLocation] = useLocation();

  return (
    <nav className="flex shrink-0 border-t border-white/5 bg-zinc-950 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {items.map((item) => {
        const active = isActive(item.path, location);
        return (
          <button
            key={item.path}
            onClick={() => setLocation(item.path)}
            className="flex-1 flex flex-col items-center gap-0.5"
          >
            <item.icon size={19} className={active ? "text-[var(--theme-primary)]" : "text-zinc-500"} />
            <span className={`text-[9px] ${active ? "text-[var(--theme-primary)] font-semibold" : "text-zinc-500"}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
