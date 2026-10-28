// What happens when someone uses a Friends League invite code or link.
// Public-list joins always go through POST /:id/request and are unaffected.

import { LEAGUE_ALREADY_STARTED_MESSAGE } from "./leagueRounds";

// New Friends Leagues require admin approval for code/link joins unless the
// creator switches it off.
export const DEFAULT_REQUIRES_JOIN_APPROVAL = true;

export function resolveJoinApprovalSetting(requested: boolean | undefined) {
  return requested ?? DEFAULT_REQUIRES_JOIN_APPROVAL;
}

export type CodeJoinDecision =
  | { action: "join" }
  | { action: "request"; alreadyPending: boolean }
  | { action: "reject"; status: 400 | 409; error: string };

export function decideCodeJoin(params: {
  requiresJoinApproval: boolean;
  started: boolean;
  alreadyMember: boolean;
  hasPendingRequest: boolean;
}): CodeJoinDecision {
  if (params.alreadyMember) return { action: "reject", status: 400, error: "You're already in this league" };
  if (params.started) return { action: "reject", status: 409, error: LEAGUE_ALREADY_STARTED_MESSAGE };
  if (!params.requiresJoinApproval) return { action: "join" };
  return { action: "request", alreadyPending: params.hasPendingRequest };
}
