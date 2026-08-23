import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAppDispatch } from "../../../app/hooks";
import { normalizeApiError } from "../../../services/api/error";
import { useLoginMutation } from "../../../services/api/knoxitApi";
import { sessionLoaded } from "../authSlice";
import { postLoginRedirect } from "../postLoginRedirect";
import { AuthLayout } from "./AuthLayout";

export default function Login() {
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();
  const [login, { isLoading }] = useLoginMutation();
  const [error, setError] = useState<string>();
  const redirect = postLoginRedirect(window.location.search);

  return (
    <AuthLayout title="Log in">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(undefined);
          const form = new FormData(event.currentTarget);

          try {
            const result = await login({
              email: String(form.get("email") ?? ""),
              password: String(form.get("password") ?? "")
            }).unwrap();
            dispatch(sessionLoaded(result.user));
            setLocation(redirect);
          } catch (requestError) {
            setError(normalizeApiError(requestError).message);
          }
        }}
      >
        {error ? <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}
        <label className="block text-sm text-zinc-300">
          Email
          <input name="email" autoComplete="email" className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white" type="email" required />
        </label>
        <label className="block text-sm text-zinc-300">
          Password
          <input name="password" autoComplete="current-password" className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white" type="password" required />
        </label>
        <button disabled={isLoading} className="w-full rounded-lg bg-[var(--theme-primary)] px-3 py-2 text-sm font-bold text-[var(--theme-primary-text)] disabled:opacity-60">
          {isLoading ? "Logging in..." : "Log in"}
        </button>
        <div className="flex justify-between text-xs text-zinc-400">
          <Link href="/signup">Create account</Link>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
