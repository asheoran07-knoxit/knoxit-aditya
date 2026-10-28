// Route: /friends-leagues/create
import { useState } from "react";
import { useLocation } from "wouter";
import { MessageSquareText, Globe, Lock, Copy, Check, Trophy, CalendarClock, UserCheck } from "lucide-react";
import { SubHeader } from "../components/Header";
import { normalizeApiError } from "../services/api/error";
import { type GameType, useCreateFriendsLeagueMutation, useGetCompetitiveLeaguesQuery } from "../services/api/knoxitApi";

function formatLock(locksAt: string | null) {
  if (!locksAt) return "Lock time to be confirmed";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    .format(new Date(locksAt));
}

export default function CreateFriendsLeague() {
  const [, setLocation] = useLocation();
  const [createFriendsLeague, { isLoading }] = useCreateFriendsLeagueMutation();
  const competitionsQuery = useGetCompetitiveLeaguesQuery();
  // Same open-round data that powers competitive joins; only competitions
  // with a round still open for entry can host a new league.
  const competitions = (competitionsQuery.data ?? []).filter((c) => c.available && c.openRounds.length > 0);

  const [name, setName] = useState("");
  const [entryTerms, setEntryTerms] = useState("");
  const [visibility, setVisibility] = useState<"public" | "invite_only">("invite_only");
  const [gameType, setGameType] = useState<GameType>("survivor");
  const [requiresJoinApproval, setRequiresJoinApproval] = useState(true);
  const [competitionKey, setCompetitionKey] = useState<string | null>(null);
  const [startingRound, setStartingRound] = useState<number | null>(null);

  const selectedCompetition = competitions.find((c) => c.competitionKey === competitionKey) ?? competitions[0] ?? null;
  const roundOptions = selectedCompetition?.openRounds ?? [];
  const selectedRound = roundOptions.find((round) => round.startingRound === startingRound) ?? roundOptions[0] ?? null;

  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    id: string;
    name: string;
    inviteCode: string;
    startingRound: number | null;
    locksAt: string | null;
    requiresJoinApproval: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const inviteLink = created ? `${window.location.origin}/join/${encodeURIComponent(created.inviteCode)}` : "";

  const submit = async () => {
    setNameError(null);
    setSubmitError(null);

    if (name.trim().length < 3) {
      setNameError("League name needs to be at least 3 characters.");
      return;
    }
    if (!selectedCompetition || !selectedRound) {
      setSubmitError("Choose a competition and starting gameweek.");
      return;
    }

    try {
      const league = await createFriendsLeague({
        name: name.trim(),
        visibility,
        entryTerms: entryTerms.trim() || undefined,
        competitionKey: selectedCompetition.competitionKey,
        startingRound: selectedRound.startingRound,
        requiresJoinApproval,
        gameType,
      }).unwrap();
      if (!league.inviteCode) {
        setSubmitError("The league was created, but no invite code came back. Open it from My Leagues.");
        return;
      }
      setCreated({
        id: league.id,
        name: league.name,
        inviteCode: league.inviteCode,
        startingRound: league.startingRound,
        locksAt: league.locksAt,
        requiresJoinApproval: league.requiresJoinApproval,
      });
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
            {created.startingRound ? `Starts GW${created.startingRound} · picks lock ${formatLock(created.locksAt)}. ` : ""}
            {created.requiresJoinApproval
              ? "Share this invite link with friends. Anyone who opens it sends you a join request to approve in Join Requests, until the first lock."
              : "Share this invite link with friends. Opening it lets them join instantly, no approval needed, until the first lock."}
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
        <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">GAME</label>
        <div className="grid grid-cols-2 gap-2 mb-1">
          {([
            { value: "survivor", title: "Survivor", blurb: "Pick one team to win each gameweek. Lose and you're out." },
            { value: "predictor", title: "Predictor", blurb: "Predict every score for 6 gameweeks. Most points wins." },
          ] as const).map((option) => (
            <button
              key={option.value}
              role="radio"
              aria-checked={gameType === option.value}
              onClick={() => setGameType(option.value)}
              className={`rounded-xl border px-3 py-2.5 text-left ${
                gameType === option.value ? "border-[var(--theme-primary-border)] bg-[var(--theme-primary-soft)]" : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <span className={`block text-[12px] font-bold ${gameType === option.value ? "text-[var(--theme-primary)]" : "text-white"}`}>{option.title}</span>
              <span className="mt-0.5 block text-[9px] leading-tight text-zinc-500">{option.blurb}</span>
            </button>
          ))}
        </div>
        <div className="text-zinc-600 text-[10px] mb-4">Friends leagues are free. There's no vault; play for bragging rights or your own arrangement.</div>

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
          <Trophy size={12} /> COMPETITION
        </label>
        {competitionsQuery.isLoading ? <div className="text-zinc-500 text-[11px] mb-4">Loading competitions…</div> : null}
        {competitionsQuery.isError ? (
          <button onClick={() => competitionsQuery.refetch()} className="text-zinc-400 text-[11px] mb-4">
            Could not load competitions. Tap to retry.
          </button>
        ) : null}
        {competitionsQuery.isSuccess && competitions.length === 0 ? (
          <div className="text-amber-400 text-[11px] mb-4">No competition has an upcoming round open right now. Try again later.</div>
        ) : null}
        {competitions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {competitions.map((competition) => {
              const selected = competition.competitionKey === selectedCompetition?.competitionKey;
              return (
                <button
                  key={competition.competitionKey}
                  onClick={() => {
                    setCompetitionKey(competition.competitionKey);
                    setStartingRound(null);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                    selected
                      ? "border-[var(--theme-primary-border)] bg-[var(--theme-primary-soft)] text-[var(--theme-primary)]"
                      : "border-white/10 bg-white/[0.03] text-zinc-400"
                  }`}
                >
                  {competition.name}
                </button>
              );
            })}
          </div>
        ) : null}

        {roundOptions.length > 0 ? (
          <>
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 mb-1.5">
              <CalendarClock size={12} /> STARTING GAMEWEEK
            </label>
            <div className="space-y-1.5 mb-1">
              {roundOptions.map((round, index) => {
                const selected = round.startingRound === selectedRound?.startingRound;
                return (
                  <button
                    key={round.startingRound}
                    onClick={() => setStartingRound(round.startingRound)}
                    className={`w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-left ${
                      selected ? "border-[var(--theme-primary-border)] bg-[var(--theme-primary-soft)]" : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <span className={`text-[13px] font-semibold ${selected ? "text-[var(--theme-primary)]" : "text-white"}`}>
                      GW{round.startingRound}
                      {index === 0 ? <span className="ml-1.5 text-[9px] font-bold text-zinc-500">NEXT</span> : null}
                    </span>
                    <span className="text-[10px] text-zinc-500">Locks {formatLock(round.locksAt)}</span>
                  </button>
                );
              })}
            </div>
            <div className="text-zinc-600 text-[10px] mb-4">
              {gameType === "predictor"
                ? "Runs for 6 gameweeks from here. Each match locks 1 hour before its own kickoff; nobody can join after the first lock. "
                : "Picks lock 1 hour before the gameweek's first match. Nobody can join after that. "}
              If fewer than 2 players have joined by then, the start moves to the next gameweek automatically.
            </div>
          </>
        ) : null}

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
          Write this yourselves if there is any arrangement. Knoxit only displays it, never sets, collects, or processes anything. There is no entry fee or member limit here; anyone with the code or an approved request can join before the first lock.
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

        <button
          role="switch"
          aria-checked={requiresJoinApproval}
          onClick={() => setRequiresJoinApproval((value) => !value)}
          className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 mb-6 text-left"
        >
          <UserCheck size={16} className={requiresJoinApproval ? "text-[var(--theme-primary)]" : "text-zinc-500"} />
          <span className="flex-1">
            <span className="block text-[12px] font-semibold text-white">Admin must approve every join</span>
            <span className="block text-[10px] text-zinc-500 leading-tight mt-0.5">
              {requiresJoinApproval
                ? "Invite code and link send you a request to approve."
                : "Invite code and link join instantly. Public requests still need approval."}
            </span>
          </span>
          <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${requiresJoinApproval ? "bg-[var(--theme-primary)]" : "bg-white/15"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${requiresJoinApproval ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </button>

        {submitError && <div className="text-red-400 text-[11px] mb-3 text-center">{submitError}</div>}
        <button
          onClick={submit}
          disabled={isLoading || !selectedRound}
          className="w-full bg-[var(--theme-primary)] text-[var(--theme-primary-text)] font-bold text-[13px] rounded-xl py-3 disabled:opacity-60"
        >
          {isLoading ? "Creating…" : "Create League"}
        </button>
      </div>
    </>
  );
}
