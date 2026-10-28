import { describe, expect, it } from "vitest";
import { samePickSelection, usedTeamsInCurrentCycle } from "../../../server/src/lib/pickRules";
import { submitPickSchema } from "../../../lib/api-zod/src/knoxit-schemas";

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

  it("server rejects a backup that equals the primary", () => {
    const base = { leagueId: "8b0e5b0e-5d2a-4f43-9c35-0d1c6a3f1e2a", gameweek: 9 };
    const sameTeam = submitPickSchema.safeParse({ ...base, primaryTeam: "Arsenal", backupTeam: "Arsenal" });
    expect(sameTeam.success).toBe(false);
    expect(sameTeam.error?.issues[0]).toMatchObject({ path: ["backupTeam"], message: "Backup pick must be different from primary pick" });
    expect(submitPickSchema.safeParse({ ...base, primaryTeam: "Arsenal", backupTeam: "Chelsea" }).success).toBe(true);
    expect(submitPickSchema.safeParse({ ...base, primaryTeam: "Arsenal" }).success).toBe(true);
  });
});
