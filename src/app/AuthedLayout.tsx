import type { ReactNode } from "react";
import { BottomNav } from "../components/BottomNav";

// Every logged-in screen: page content scrolls in the area above, the bottom
// navigation sits below it in normal flow, so content can never end up hidden
// behind the bar.
export function AuthedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[100dvh] flex-col md:h-[min(820px,calc(100dvh-3rem))]">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar">{children}</div>
      <BottomNav />
    </div>
  );
}
