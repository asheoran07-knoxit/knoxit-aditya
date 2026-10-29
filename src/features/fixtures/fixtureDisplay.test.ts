import { describe, expect, it } from "vitest";
import { currentGameweek, fixtureDisplay } from "./fixtureDisplay";

describe("fixtureDisplay", () => {
  it("shows final scores for completed matches", () => {
    expect(fixtureDisplay("FINISHED")).toEqual({ showScore: true, label: "FT", live: false });
    expect(fixtureDisplay("AWARDED").showScore).toBe(true);
  });

  it("shows current scores for live and paused matches", () => {
    expect(fixtureDisplay("IN_PLAY")).toEqual({ showScore: true, label: "LIVE", live: true });
    expect(fixtureDisplay("PAUSED")).toEqual({ showScore: true, label: "HALF-TIME", live: true });
  });

  it("shows status instead of a score for postponed matches", () => {
    expect(fixtureDisplay("POSTPONED")).toEqual({ showScore: false, label: "POSTPONED", live: false });
  });
});

describe("current gameweek", () => {
  const fixture = (matchday: number, status: string) => ({ matchday, status });

  it("stays on the provider's gameweek while matches are still to play", () => {
    expect(currentGameweek([fixture(9, "FINISHED"), fixture(9, "TIMED"), fixture(10, "TIMED")], 9)).toBe(9);
  });

  it("moves on once every match is finished (postponed ones don't hold it back)", () => {
    expect(currentGameweek([fixture(9, "FINISHED"), fixture(9, "POSTPONED"), fixture(10, "TIMED")], 9)).toBe(10);
    expect(currentGameweek([fixture(9, "FINISHED"), fixture(10, "FINISHED"), fixture(11, "SCHEDULED")], 9)).toBe(11);
  });

  it("stays on the last gameweek at the end of the season and copes with no data", () => {
    expect(currentGameweek([fixture(38, "FINISHED")], 38)).toBe(38);
    expect(currentGameweek([], 5)).toBe(5);
    expect(currentGameweek([fixture(1, "TIMED")], null)).toBe(1);
  });
});
