import { describe, expect, it } from "vitest";
import { fixtureDisplay } from "./fixtureDisplay";

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
