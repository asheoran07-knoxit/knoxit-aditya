// Route: /friends-leagues/create
import { useState } from "react";
import { useLocation } from "wouter";
import { MessageSquareText, Globe, Lock, Copy, Check } from "lucide-react";
import { SubHeader } from "../components/Header";
import { normalizeApiError } from "../services/api/error";
import { useCreateFriendsLeagueMutation } from "../services/api/knoxitApi";

export default function CreateFriendsLeague() {
  const [, setLocation] = useLocation();
  const [createFriendsLeague, { isLoading }] = useCreateFriendsLeagueMutation();

  const [name, setName] = useState("");
  const [entryTerms, setEntryTerms] = useState("");
  const [visibility, setVisibility] = useState<"public" | "invite_only">("invite_only");

  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string; inviteCode: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteLink = created ? `${window.location.origin}/join/${encodeURIComponent(created.inviteCode)}` : "";

  const submit = async () => {
    setNameError(null);
    setSubmitError(null);

    if (name.trim().length < 3) {
      setNameError("League name needs to be at least 3 characters.");
      return;
    }

    try {
      const league = await createFriendsLeague({
        name: name.trim(),
        visibility,
        entryTerms: entryTerms.trim() || undefined,
      }).unwrap();
      if (!league.inviteCode) {
        setSubmitError("The league was created, but no invite code came back. Open it from My Leagues.");
        return;
      }
      setCreated({ id: league.id, name: league.name, inviteCode: league.inviteCode });
    } catch (requestError) {
      const normalized = normalizeApiError(requestError);
      // 409 = the server's case-insensitive name uniqueness check.
      if (normalized.status === 409) setNameError(normalized.message);
      else setSubmitError(normalized.message);
    }
  };

  const copyInviteLink = () => {
    if (!created) return;
    navigator.clipboard?.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (created) {
    return (
      <>
        <SubHeader title="League Created" onBack={() => setLocation("/")} />
        <div className="flex-1 flex flex-col items-center px-4 pt-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--theme-primary-soft)] border border-[var(--theme-primary-border)] flex items-center justify-center mb-4">
            <Check size={26} className="text-[var(--theme-primary)]" />
          </div>
          <div className="text-white text-[17px] font-bold mb-1">{created.name} is live!</div>
          <div className="text-zinc-500 text-[12px] mb-6 max-w-[260px]">
            Share this invite link with friends. Opening it lets them join instantly, no approval needed.
          </div>

          <div className="w-full bg-[var(--theme-primary-subtle)] border border-[var(--theme-primary-border)] rounded-2xl p-4 mb-3">
            <div className="text-[var(--theme-primary)] text-[10px] font-bold mb-2 tracking-wide">INVITE CODE</div>
            <div className="text-white text-[26px] font-extrabold tracking-[0.25em]">{created.inviteCode}</div>
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-left text-[11px] text-zinc-400 break-all">
              {inviteLink}
            </div>
            <button
              onClick={copyInviteLink}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--theme-primary-border)] bg-[var(--theme-primary-soft)] px-2.5 py-2 text-[11px] font-semibold text-[var(--theme-primary)]"
            >
              <Copy size={12} /> {copied ? "Link copied" : "Copy invite link"}
            </button>
          </div>

          <button
            onClick={() => setLocation(`/leagues/${created.id}`)}
            className="w-full bg-[var(--theme-primary)] text-[var(--theme-primary-text)] font-bold text-[13px] rounded-xl py-3 mt-2"
          >
            Open League
          </button>
          <button
            onClick={() => setLocation("/my-leagues")}
            className="w-full text-[var(--theme-primary)] font-semibold text-[12px] py-3"
          >
            Go to My Leagues
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <SubHeader title="Create Friends League" onBack={() => window.history.back()} />
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 pb-4">
        <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">LEAGUE NAME</label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
          placeholder="e.g. Weekend Warriors"
          maxLength={60}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-white text-[14px] placeholder:text-zinc-600 focus:outline-none focus:border-[var(--theme-primary-ring)] mb-1"
        />
        {nameError && <div className="text-red-400 text-[11px] mb-2">{nameError}</div>}
        <div className="text-zinc-600 text-[10px] mb-4">Must be unique. No two public friends leagues can share a name.</div>

        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 mb-1.5">
          <MessageSquareText size={12} /> ENTRY TERMS <span className="text-zinc-600 font-normal">(optional)</span>
        </label>
        <textarea
          value={entryTerms}
          onChange={(e) => setEntryTerms(e.target.value)}
          placeholder="e.g. 500 each, winner takes the pot, settled via UPI within the group"
          maxLength={500}
          rows={3}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-white text-[13px] placeholder:text-zinc-600 focus:outline-none focus:border-[var(--theme-primary-ring)] resize-none mb-1"
        />
        <div className="text-zinc-600 text-[10px] mb-4">
          Write this yourselves if there is any arrangement. Knoxit only displays it, never sets, collects, or processes anything. There is no entry fee or member limit here; anyone with the code or an approved request can join.
        </div>

        <label className="block text-[11px] font-semibold text-zinc-400 mb-2">VISIBILITY</label>
        <div className="grid grid-cols-2 gap-2 mb-6">
          <button
            onClick={() => setVisibility("invite_only")}
            className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 ${
              visibility === "invite_only" ? "border-[var(--theme-primary-border)] bg-[var(--theme-primary-soft)]" : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <Lock size={16} className={visibility === "invite_only" ? "text-[var(--theme-primary)]" : "text-zinc-500"} />
            <span className={`text-[11px] font-semibold ${visibility === "invite_only" ? "text-[var(--theme-primary)]" : "text-zinc-400"}`}>Invite-only</span>
            <span className="text-[9px] text-zinc-600 px-2 text-center leading-tight">Only joinable via code</span>
          </button>
          <button
            onClick={() => setVisibility("public")}
            className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 ${
              visibility === "public" ? "border-[var(--theme-primary-border)] bg-[var(--theme-primary-soft)]" : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <Globe size={16} className={visibility === "public" ? "text-[var(--theme-primary)]" : "text-zinc-500"} />
            <span className={`text-[11px] font-semibold ${visibility === "public" ? "text-[var(--theme-primary)]" : "text-zinc-400"}`}>Public</span>
            <span className="text-[9px] text-zinc-600 px-2 text-center leading-tight">Discoverable, needs approval</span>
          </button>
        </div>

        {submitError && <div className="text-red-400 text-[11px] mb-3 text-center">{submitError}</div>}
        <button
          onClick={submit}
          disabled={isLoading}
          className="w-full bg-[var(--theme-primary)] text-[var(--theme-primary-text)] font-bold text-[13px] rounded-xl py-3 disabled:opacity-60"
        >
          {isLoading ? "Creating…" : "Create League"}
        </button>
      </div>
    </>
  );
}
