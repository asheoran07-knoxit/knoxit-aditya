import { describe, expect, it } from "vitest";
import { buildPlayerProfile, isPickHidden } from "./playerProfile";

const now = new Date("2026-10-30T12:00:00.000Z");
const beforeLock = { currentGameweek: 10, locksAt: new Date("2026-10-31T11:30:00.000Z") };
const afterLock = { currentGameweek: 10, locksAt: new Date("2026-10-30T11:30:00.000Z") };

const history = [
  { gameweek: 7, primaryTeam: "Arsenal", backupTeam: null, usedBackup: false, result: "survived" as const },
  { gameweek: 8, primaryTeam: "Chelsea", backupTeam: "Spurs", usedBackup: true, result: "survived" as const },
  { gameweek: 9, primaryTeam: "Liverpool", backupTeam: null, usedBackup: false, result: "survived" as const },
  { gameweek: 10, primaryTeam: "Man City", backupTeam: "Newcastle", usedBackup: false, result: "pending" as const },
];

describe("hidden picks", () => {
  it("hides the current gameweek's pick until it locks", () => {
    expect(isPickHidden(10, beforeLock, now)).toBe(true);
    expect(isPickHidden(10, afterLock, now)).toBe(false);
    expect(isPickHidden(9, beforeLock, now)).toBe(false);
  });

  it("never reveals the team names of an unlocked pick", () => {
    const profile = buildPlayerProfile({ picks: history, league: beforeLock, knockedOutAtGameweek: null, knockoutReason: null, now });
    expect(profile.picks[0]).toEqual({ gameweek: 10, hidden: true, primaryTeam: null, backupTeam: null, usedBackup: false, result: "pending" });
    expect(JSON.stringify(profile)).not.toContain("Man City");
    expect(JSON.stringify(profile)).not.toContain("Newcastle");
  });

  it("reveals it once the gameweek has locked", () => {
    const profile = buildPlayerProfile({ picks: history, league: afterLock, knockedOutAtGameweek: null, knockoutReason: null, now });
    expect(profile.picks[0]).toMatchObject({ gameweek: 10, hidden: false, primaryTeam: "Man City" });
  });
});

describe("profile stats", () => {
  it("counts the current streak, gameweeks survived and record", () => {
    const profile = buildPlayerProfile({ picks: history, league: beforeLock, knockedOutAtGameweek: null, knockoutReason: null, now });
    expect(profile.stats).toEqual({ currentStreak: 3, gameweeksSurvived: 3, gameweeksPlayed: 3, survivalRate: 100 });
    expect(profile.picks.map((pick) => pick.gameweek)).toEqual([10, 9, 8, 7]);
  });

  it("ends the streak at a knockout and shows a missed pick", () => {
    const profile = buildPlayerProfile({
      picks: history.slice(0, 2),
      league: { currentGameweek: 10, locksAt: afterLock.locksAt },
      knockedOutAtGameweek: 9,
      knockoutReason: "NO_PICK_SUBMITTED",
      now,
    });
    expect(profile.picks[0]).toEqual({ gameweek: 9, hidden: false, primaryTeam: null, backupTeam: null, usedBackup: false, result: "no_pick" });
    expect(profile.stats).toEqual({ currentStreak: 0, gameweeksSurvived: 2, gameweeksPlayed: 3, survivalRate: 67 });
  });
});
