import type { ReactNode } from "react";

// On desktop the app sits in an 820px "phone" frame, shrunk to fit shorter
// windows (3rem = the md:py-6 padding) so the bottom nav never drops off-screen.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-knoxit-bg text-zinc-100 md:py-6">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1180px] bg-zinc-950 shadow-glow md:min-h-[min(820px,calc(100dvh-3rem))] md:rounded-2xl md:border md:border-[var(--theme-primary-border)]">
        <main className="flex min-h-[100dvh] w-full flex-col overflow-hidden md:min-h-[min(820px,calc(100dvh-3rem))]">
          {children}
        </main>
      </div>
    </div>
  );
}
