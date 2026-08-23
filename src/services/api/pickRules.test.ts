import { describe, expect, it } from "vitest";
import { samePickSelection, usedTeamsInCurrentCycle } from "../../../server/src/lib/pickRules";

describe("pick rules", () => {
  it("counts both primary and backup teams as used", () => {
    const used = usedTeamsInCurrentCycle([
      { primaryTeam: "Arsenal", backupTeam: "Chelsea" },
      { primaryTeam: "Liverpool", backupTeam: null },
    ], 20);

    expect(Array.from(used)).toEqual(["Arsenal", "Chelsea", "Liverpool"]);
  });

  it("starts a new cycle after the previous pool is exhausted", () => {
    const used = usedTeamsInCurrentCycle([
      { primaryTeam: "Arsenal", backupTeam: "Chelsea" },
      { primaryTeam: "Liverpool", backupTeam: null },
    ], 2);

    expect(Array.from(used)).toEqual(["Liverpool"]);
  });

  it("recognizes an identical retry", () => {
    const existing = { primaryTeam: "Arsenal", backupTeam: "Chelsea" };

    expect(samePickSelection(existing, { primaryTeam: "Arsenal", backupTeam: "Chelsea" })).toBe(true);
    expect(samePickSelection(existing, { primaryTeam: "Liverpool", backupTeam: "Chelsea" })).toBe(false);
  });
});
