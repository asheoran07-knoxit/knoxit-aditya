import { describe, expect, it } from "vitest";
import type { PickDashboardItem } from "../../services/api/knoxitApi";
import { groupPickDashboard, lockCountdown, pickedTeam } from "./pickDashboard";

const base: PickDashboardItem = {
  leagueId: "l1",
  leagueName: "Premier League Survivor",
  code: "PL-26-R10-1",
  competitionKey: "epl",
  gameweek: 10,
  leagueStatus: "active",
  memberStatus: "alive",
  locksAt: "2026-10-30T12:00:00.000Z",
  canSubmit: false,
  canEdit: false,
  pick: null,
  fixture: null,
};

const pick = {
  id: "p1",
  leagueId: "l1",
  userId: "u1",
  gameweek: 10,
  primaryTeam: "Arsenal",
  backupTeam: "Chelsea",
  result: "pending" as const,
  usedBackup: false,
  submittedAt: "2026-10-29T12:00:00.000Z",
};

const fixture = {
  providerId: 1,
  utcDate: "2026-10-30T13:00:00.000Z",
  status: "IN_PLAY",
  homeTeamName: "Arsenal",
  awayTeamName: "Everton",
  homeScore: 1,
  awayScore: 0,
  winner: null,
};

describe("groupPickDashboard", () => {
  it("buckets each league by what the player needs to do", () => {
    const groups = groupPickDashboard([
      { ...base, leagueId: "needs-pick", canSubmit: true },
      { ...base, leagueId: "editable", canEdit: true, pick },
      { ...base, leagueId: "live", pick, fixture },
      { ...base, leagueId: "waiting", pick, fixture: { ...fixture, status: "TIMED" } },
      { ...base, leagueId: "settled", pick: { ...pick, result: "survived" } },
      { ...base, leagueId: "out", memberStatus: "knocked_out" },
    ]);

    expect(groups.lockingSoon.map((item) => item.leagueId)).toEqual(["needs-pick"]);
    expect(groups.submitted.map((item) => item.leagueId)).toEqual(["editable"]);
    expect(groups.live.map((item) => item.leagueId)).toEqual(["live"]);
    expect(groups.awaitingResults.map((item) => item.leagueId)).toEqual(["waiting"]);
  });

  it("orders picks needing action by soonest lock", () => {
    const groups = groupPickDashboard([
      { ...base, leagueId: "later", canSubmit: true, locksAt: "2026-11-01T12:00:00.000Z" },
      { ...base, leagueId: "sooner", canSubmit: true, locksAt: "2026-10-29T12:00:00.000Z" },
    ]);
    expect(groups.lockingSoon.map((item) => item.leagueId)).toEqual(["sooner", "later"]);
  });
});

describe("pick dashboard helpers", () => {
  it("reports the team actually in play", () => {
    expect(pickedTeam({ ...base, pick })).toBe("Arsenal");
    expect(pickedTeam({ ...base, pick: { ...pick, usedBackup: true } })).toBe("Chelsea");
  });

  it("formats lock countdowns", () => {
    const now = new Date("2026-10-30T10:00:00.000Z").getTime();
    expect(lockCountdown("2026-10-30T10:18:00.000Z", now)).toBe("18m");
    expect(lockCountdown("2026-10-30T11:42:00.000Z", now)).toBe("1h 42m");
    expect(lockCountdown("2026-11-01T14:00:00.000Z", now)).toBe("2d 4h");
    expect(lockCountdown("2026-10-30T09:00:00.000Z", now)).toBe("Locked");
  });
});
