import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Check, KeyRound, LogIn, Trophy, Users } from "lucide-react";
import { normalizeApiError } from "../services/api/error";
import { useJoinByCodeMutation } from "../services/api/knoxitApi";

type PublicJoinProps = {
  params?: {
    inviteCode?: string;
  };
};

function normalizeInviteCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);
}

function getInitialCode(params?: PublicJoinProps["params"]) {
  const queryCode = new URLSearchParams(window.location.search).get("code") ?? "";
  return normalizeInviteCode(params?.inviteCode ?? queryCode);
}

export default function PublicJoin({ params }: PublicJoinProps) {
  const [, setLocation] = useLocation();
  const [joinByCode, { isLoading }] = useJoinByCodeMutation();
  const [code, setCode] = useState(() => getInitialCode(params));
  const [state, setState] = useState<"idle" | "success" | "requested" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async () => {
    const inviteCode = normalizeInviteCode(code);
    if (inviteCode.length < 4) return;

    try {
      const result = await joinByCode({ inviteCode }).unwrap();
      if (result.requested) {
        setState("requested");
        setMessage(`Request sent — waiting for admin approval to join ${result.leagueName}.`);
        return;
      }

      setState("success");
      setMessage(`You joined ${result.leagueName}.`);
      setTimeout(() => setLocation(`/leagues/${result.leagueId}`), 1200);
    } catch (error) {
      // Show the server's reason for a real rejection (wrong code, already a
      // member, league already started); signed-out visitors get the login hint.
      const normalized = normalizeApiError(error);
      setState("error");
      setMessage(normalized.status === 400 || normalized.status === 404 || normalized.status === 409
        ? normalized.message
        : "We could not join with that code. Check it again, or log in first if this is a private invite.");
    }
  };

  const loginHref = `/login?redirect=${encodeURIComponent(code ? `/join/${normalizeInviteCode(code)}` : "/join")}`;

  return (
    <div className="flex min-h-screen flex-col px-4 py-5">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-[18px] font-extrabold tracking-wide text-white">
          KNOXIT
        </Link>
        <Link href={loginHref} className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--theme-primary)]">
          <LogIn size={14} /> Log in
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center py-8">
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
          <div className="mb-5 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--theme-primary-border)] bg-[var(--theme-primary-soft)]">
              <Trophy size={28} className="text-[var(--theme-primary)]" />
            </div>
            <h1 className="text-[24px] font-extrabold leading-tight text-white">Join a Knoxit league</h1>
            <p className="mt-2 max-w-[310px] text-[13px] leading-5 text-zinc-400">
              Enter your friend&apos;s invite code to jump into their league and start picking your survivor team.
            </p>
          </div>

          <label className="mb-1.5 block text-[11px] font-bold tracking-wide text-zinc-400">INVITE CODE</label>
          <div className="relative">
            <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-primary)]" />
            <input
              value={code}
              onChange={(event) => {
                setCode(normalizeInviteCode(event.target.value));
                setState("idle");
              }}
              placeholder="GULLY7"
              maxLength={12}
              className="w-full rounded-xl border border-white/10 bg-zinc-950 py-3 pl-10 pr-3 text-center text-[17px] font-extrabold tracking-[0.22em] text-white placeholder:text-zinc-600 placeholder:tracking-normal focus:border-[var(--theme-primary-ring)] focus:outline-none"
            />
          </div>

          {state === "error" && (
            <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-center text-[12px] text-red-300">
              {message}
            </div>
          )}
          {state === "success" && (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-[var(--theme-primary-border)] bg-[var(--theme-primary-soft)] px-3 py-2 text-center text-[12px] text-[var(--theme-primary)]">
              <Check size={14} /> {message}
            </div>
          )}
          {state === "requested" && (
            <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-center text-[12px] text-amber-300">
              {message}
            </div>
          )}

          <button
            onClick={submit}
            disabled={normalizeInviteCode(code).length < 4 || isLoading || state === "requested"}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--theme-primary)] py-3 text-[13px] font-extrabold text-[var(--theme-primary-text)] disabled:bg-white/5 disabled:text-zinc-600"
          >
            <Users size={16} /> {isLoading ? "Joining..." : "Join League"}
          </button>

          <div className="mt-4 flex items-center justify-center gap-3 text-[12px] text-zinc-500">
            <Link href="/signup" className="font-semibold text-zinc-300">
              Create account
            </Link>
            <span className="h-1 w-1 rounded-full bg-zinc-700" />
            <Link href="/friends-leagues/join-by-code" className="font-semibold text-zinc-300">
              Open in app
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
