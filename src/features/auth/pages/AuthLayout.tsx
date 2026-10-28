import type { ReactNode } from "react";
import { BetaBadge, Logo } from "../../../components/Logo";

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-5 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <Logo size={22} />
            <BetaBadge />
          </div>
          <h1 className="mt-3 text-xl font-bold text-white">{title}</h1>
        </div>
        {children}
      </section>
    </div>
  );
}
