export type PickOutcome = "win" | "draw" | "loss" | "no_result";
export type PickResolution = "survived" | "eliminated" | "pending";

export function getUsedTeamsThisCycle(history: string[], poolSize: number): Set<string> {
  let used = new Set<string>();
  for (const team of history) {
    used.add(team);
    if (used.size >= poolSize) used = new Set<string>();
  }
  return used;
}

export function isTeamUnavailable(team: string, usedTeams: Set<string>, teamRecallTeam?: string | null) {
  return usedTeams.has(team) && teamRecallTeam !== team;
}

export function validatePickPair(primaryTeam: string | null, backupTeam?: string | null) {
  if (!primaryTeam) return { ok: false, reason: "primary_required" as const };
  if (backupTeam && backupTeam === primaryTeam) return { ok: false, reason: "backup_matches_primary" as const };
  return { ok: true as const };
}

export function shouldUseBackup(outcome: PickOutcome) {
  return outcome === "no_result";
}

export function resolvePrimaryOutcome(outcome: PickOutcome, hasDrawShield: boolean): PickResolution {
  if (outcome === "win") return "survived";
  if (outcome === "draw") return hasDrawShield ? "survived" : "eliminated";
  if (outcome === "loss") return "eliminated";
  return "pending";
}

export function canManageFriendsLeague(params: { leagueType: "competitive" | "friends"; isCreator: boolean; isAdmin: boolean }) {
  return params.leagueType === "friends" && (params.isCreator || params.isAdmin);
}

export function canChangeAdminStatus(params: { isCreator: boolean; targetIsCreator: boolean }) {
  return params.isCreator && !params.targetIsCreator;
}

export function canProposeSplit(aliveCount: number, isAlive: boolean) {
  return isAlive && aliveCount <= 5;
}

export function canTakeLeagueAction(params: {
  leagueStatus: "upcoming" | "active" | "completed" | "split";
  memberStatus: "alive" | "knocked_out";
  locksAt: string | null;
  hasCurrentPick: boolean;
  now: number;
}) {
  const isOpenStatus = params.leagueStatus === "upcoming" || params.leagueStatus === "active";
  const isBeforeLock = params.locksAt !== null && new Date(params.locksAt).getTime() > params.now;
  return params.memberStatus === "alive" && isOpenStatus && isBeforeLock && !params.hasCurrentPick;
}
