import { describe, expect, it } from "vitest";
import {
  canChangeAdminStatus,
  canManageFriendsLeague,
  canProposeSplit,
  canTakeLeagueAction,
  getUsedTeamsThisCycle,
  isTeamUnavailable,
  resolvePrimaryOutcome,
  shouldUseBackup,
  validatePickPair
} from "./rules";

describe("Knoxit business rules", () => {
  it("resets the used-team cycle only after the full pool is used", () => {
    expect([...getUsedTeamsThisCycle(["Arsenal", "Chelsea"], 3)]).toEqual(["Arsenal", "Chelsea"]);
    expect([...getUsedTeamsThisCycle(["Arsenal", "Chelsea", "Liverpool"], 3)]).toEqual([]);
  });

  it("marks used teams unavailable unless Team Recall covers the exact team", () => {
    expect(isTeamUnavailable("Arsenal", new Set(["Arsenal"]))).toBe(true);
    expect(isTeamUnavailable("Arsenal", new Set(["Arsenal"]), "Arsenal")).toBe(false);
  });

  it("rejects backup equal to primary", () => {
    expect(validatePickPair("Arsenal", "Arsenal")).toEqual({ ok: false, reason: "backup_matches_primary" });
  });

  it("uses backup only for no_result", () => {
    expect(shouldUseBackup("no_result")).toBe(true);
    expect(shouldUseBackup("draw")).toBe(false);
    expect(shouldUseBackup("loss")).toBe(false);
  });

  it("survives wins and Draw Shield draws, eliminates losses", () => {
    expect(resolvePrimaryOutcome("win", false)).toBe("survived");
    expect(resolvePrimaryOutcome("draw", true)).toBe("survived");
    expect(resolvePrimaryOutcome("draw", false)).toBe("eliminated");
    expect(resolvePrimaryOutcome("loss", true)).toBe("eliminated");
  });

  it("scopes friends league permissions", () => {
    expect(canManageFriendsLeague({ leagueType: "friends", isCreator: false, isAdmin: true })).toBe(true);
    expect(canManageFriendsLeague({ leagueType: "competitive", isCreator: true, isAdmin: true })).toBe(false);
    expect(canChangeAdminStatus({ isCreator: true, targetIsCreator: false })).toBe(true);
    expect(canChangeAdminStatus({ isCreator: true, targetIsCreator: true })).toBe(false);
  });

  it("allows split proposal only for alive users at five or fewer survivors", () => {
    expect(canProposeSplit(5, true)).toBe(true);
    expect(canProposeSplit(6, true)).toBe(false);
    expect(canProposeSplit(4, false)).toBe(false);
  });

  it("shows Take Action only to an alive member before lock without a current pick", () => {
    const open = {
      leagueStatus: "upcoming" as const,
      memberStatus: "alive" as const,
      locksAt: "2026-08-28T17:30:00.000Z",
      hasCurrentPick: false,
      now: new Date("2026-08-28T16:30:00.000Z").getTime(),
    };

    expect(canTakeLeagueAction(open)).toBe(true);
    expect(canTakeLeagueAction({ ...open, hasCurrentPick: true })).toBe(false);
    expect(canTakeLeagueAction({ ...open, memberStatus: "knocked_out" })).toBe(false);
    expect(canTakeLeagueAction({ ...open, now: new Date(open.locksAt).getTime() })).toBe(false);
    expect(canTakeLeagueAction({ ...open, leagueStatus: "completed" })).toBe(false);
  });
});
