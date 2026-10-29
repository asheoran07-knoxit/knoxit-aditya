import { describe, expect, it } from "vitest";
import { opponentsForGameweek } from "./pickRules";

const fixture = (matchday: number, home: string, away: string, date: string) => ({
  matchday, utcDate: new Date(date), homeTeamName: home, homeTeamShortName: null, awayTeamName: away, awayTeamShortName: `${away} short`,
});

describe("pick screen opponents", () => {
  it("gives each team its opponent and home/away for the gameweek only", () => {
    const opponents = opponentsForGameweek([
      fixture(9, "Chelsea", "Man United", "2026-10-31T17:00:00Z"),
      fixture(10, "Chelsea", "Arsenal", "2026-11-07T15:00:00Z"),
    ], 9);
    expect(opponents.get("Chelsea")).toMatchObject({ opponent: "Man United", opponentShortName: "Man United short", home: true });
    expect(opponents.get("Man United")).toMatchObject({ opponent: "Chelsea", home: false });
    expect(opponents.has("Arsenal")).toBe(false);
  });

  it("shows a team's earliest match if it plays twice in one gameweek", () => {
    const opponents = opponentsForGameweek([
      fixture(9, "Chelsea", "Spurs", "2026-11-01T17:00:00Z"),
      fixture(9, "Leeds", "Chelsea", "2026-10-31T12:00:00Z"),
    ], 9);
    expect(opponents.get("Chelsea")).toMatchObject({ opponent: "Leeds", home: false });
  });
});
