import { describe, expect, it } from "vitest";
import { decideCodeJoin, resolveJoinApprovalSetting } from "./friendsJoinRules";

const open = { requiresJoinApproval: true, started: false, alreadyMember: false, hasPendingRequest: false };

describe("friends league join approval setting", () => {
  it("is on by default for new leagues", () => {
    expect(resolveJoinApprovalSetting(undefined)).toBe(true);
  });

  it("respects the creator's choice", () => {
    expect(resolveJoinApprovalSetting(false)).toBe(false);
    expect(resolveJoinApprovalSetting(true)).toBe(true);
  });
});

describe("joining by invite code or link", () => {
  it("files a pending request when approval is required", () => {
    expect(decideCodeJoin(open)).toEqual({ action: "request", alreadyPending: false });
  });

  it("doesn't file a second request while one is pending", () => {
    expect(decideCodeJoin({ ...open, hasPendingRequest: true })).toEqual({ action: "request", alreadyPending: true });
  });

  it("joins instantly when approval is switched off", () => {
    expect(decideCodeJoin({ ...open, requiresJoinApproval: false })).toEqual({ action: "join" });
  });

  it("rejects after the league has started, whatever the setting", () => {
    for (const requiresJoinApproval of [true, false]) {
      expect(decideCodeJoin({ ...open, requiresJoinApproval, started: true })).toEqual({
        action: "reject",
        status: 409,
        error: "This league has already started",
      });
    }
  });

  it("rejects existing members", () => {
    expect(decideCodeJoin({ ...open, alreadyMember: true })).toMatchObject({ action: "reject", status: 400 });
  });
});
