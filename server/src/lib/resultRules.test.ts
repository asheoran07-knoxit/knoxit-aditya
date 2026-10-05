import { describe, expect, it } from "vitest";
import { fixtureForTeam, fixtureOutcomeForTeam } from "./resultRules";

const fixture = {
  status: "FINISHED",
  winner: "HOME_TEAM",
  homeTeamName: "Arsenal",
  awayTeamName: "Chelsea",
};

describe("fixture result rules", () => {
  it("maps a finished result from either team's perspective", () => {
    expect(fixtureOutcomeForTeam(fixture, "Arsenal")).toBe("win");
    expect(fixtureOutcomeForTeam(fixture, "Chelsea")).toBe("loss");
    expect(fixtureOutcomeForTeam({ ...fixture, winner: "DRAW" }, "Chelsea")).toBe("draw");
  });

  it("keeps in-progress fixtures pending and marks abandoned fixtures as no-result", () => {
    expect(fixtureOutcomeForTeam({ ...fixture, status: "IN_PLAY", winner: null }, "Arsenal")).toBe("pending");
    expect(fixtureOutcomeForTeam({ ...fixture, status: "POSTPONED", winner: null }, "Arsenal")).toBe("no_result");
  });

  it("finds the fixture for a selected team", () => {
    expect(fixtureForTeam([fixture], "Chelsea")).toBe(fixture);
    expect(fixtureForTeam([fixture], "Liverpool")).toBeUndefined();
  });
});
