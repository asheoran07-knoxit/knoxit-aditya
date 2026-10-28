import { describe, expect, it } from "vitest";
import type { PredictorDashboardItem } from "../../services/api/knoxitApi";
import { summarizePredictor } from "./predictorStatus";

const item = (leagueId: string, toPredict: number, totalMatches: number, nextLock: string | null): PredictorDashboardItem => ({
  leagueId, leagueName: leagueId, code: leagueId, competitionKey: "epl", gameweek: 9, totalMatches, predictedMatches: totalMatches - toPredict, toPredict, nextLock,
});

describe("Home predictor summary", () => {
  it("invites players with no Predictor league to join one", () => {
    expect(summarizePredictor([])).toEqual({ kind: "no_leagues" });
  });

  it("adds up what's left to predict and points at the soonest deadline", () => {
    expect(summarizePredictor([
      item("later", 3, 10, "2026-11-02T12:00:00.000Z"),
      item("sooner", 4, 10, "2026-11-01T12:00:00.000Z"),
      item("done", 0, 10, "2026-10-31T12:00:00.000Z"),
    ])).toEqual({ kind: "to_predict", toPredict: 7, total: 20, firstLock: "2026-11-01T12:00:00.000Z", leagueId: "sooner" });
  });

  it("reports everything predicted with the next lock", () => {
    expect(summarizePredictor([item("a", 0, 10, "2026-11-02T12:00:00.000Z"), item("b", 0, 10, "2026-11-01T12:00:00.000Z")]))
      .toEqual({ kind: "all_predicted", nextLock: "2026-11-01T12:00:00.000Z", leagueId: "b" });
  });
});
