import { describe, expect, it } from "vitest";
import type { PredictorMatch } from "../../services/api/knoxitApi";
import { changedPredictions, countPredicted, draftFromMatches, stepScore, toggleBooster } from "./predictDraft";

const match = (fixtureId: number, locked = false, myPrediction: PredictorMatch["myPrediction"] = null): PredictorMatch => ({
  fixtureId,
  kickoff: "2026-11-01T15:00:00.000Z",
  locksAt: "2026-11-01T14:00:00.000Z",
  locked,
  status: locked ? "IN_PLAY" : "TIMED",
  homeScore: null,
  awayScore: null,
  home: { name: "Home", shortName: null, crest: null },
  away: { name: "Away", shortName: null, crest: null },
  myPrediction,
  revealed: [],
});

describe("predict screen draft", () => {
  it("starts an untouched match at 0–0 on the first tap", () => {
    expect(stepScore({}, 1, "home", 1)[1]).toEqual({ home: 1, away: 0, booster: null });
    expect(stepScore({}, 1, "away", -1)[1]).toEqual({ home: 0, away: 0, booster: null });
  });

  it("keeps scores between 0 and 20", () => {
    expect(stepScore({ 1: { home: 0, away: 0, booster: null } }, 1, "home", -1)[1].home).toBe(0);
    expect(stepScore({ 1: { home: 20, away: 0, booster: null } }, 1, "home", 1)[1].home).toBe(20);
  });

  it("moves the Joker to the newly chosen open match", () => {
    const matches = [match(1), match(2)];
    const draft = { 1: { home: 1, away: 0, booster: "joker" as const }, 2: { home: 2, away: 2, booster: null } };
    const result = toggleBooster(draft, matches, 2, "joker", 1);
    expect(result.error).toBeNull();
    expect(result.draft[1].booster).toBeNull();
    expect(result.draft[2].booster).toBe("joker");
  });

  it("can't take a booster off a match that has locked", () => {
    const matches = [match(1, true), match(2)];
    const draft = { 1: { home: 1, away: 0, booster: "wildcard" as const } };
    expect(toggleBooster(draft, matches, 2, "wildcard", 1)).toEqual({ draft, error: "Your Wildcard is on a match that has locked", replaced: null });
  });

  it("swaps a Joker for a Wildcard on the same match and toggles off on a second tap", () => {
    const matches = [match(1)];
    const withJoker = toggleBooster({}, matches, 1, "joker", 1);
    expect(withJoker.replaced).toBeNull();
    const swapped = toggleBooster(withJoker.draft, matches, 1, "wildcard", 1);
    expect(swapped.draft[1]).toEqual({ home: 0, away: 0, booster: "wildcard" });
    expect(swapped.replaced).toBe("joker");
    const back = toggleBooster(swapped.draft, matches, 1, "joker", 1);
    expect(back.replaced).toBe("wildcard");
    expect(toggleBooster(swapped.draft, matches, 1, "wildcard", 1)).toMatchObject({ replaced: null });
    expect(toggleBooster(swapped.draft, matches, 1, "wildcard", 1).draft[1].booster).toBeNull();
  });

  it("doesn't report a swap when the booster only moves between matches", () => {
    const matches = [match(1), match(2)];
    const draft = { 1: { home: 1, away: 0, booster: "joker" as const } };
    expect(toggleBooster(draft, matches, 2, "joker", 1).replaced).toBeNull();
  });

  it("sends only open matches that changed", () => {
    const saved = { homeGoals: 1, awayGoals: 0, booster: null, outcome: null, points: null };
    const matches = [match(1, false, saved), match(2), match(3, true, saved)];
    const draft = { ...draftFromMatches(matches), 2: { home: 3, away: 1, booster: null } };
    expect(changedPredictions(draft, matches)).toEqual([{ fixtureId: 2, homeGoals: 3, awayGoals: 1, booster: null }]);
    expect(countPredicted(draft, matches)).toBe(3);
  });
});
