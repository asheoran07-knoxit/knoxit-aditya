import { describe, expect, it } from "vitest";
import {
  applyPredictionChanges,
  boosterAllowance,
  currentPredictorGameweek,
  isMatchLocked,
  isMiniSeasonComplete,
  matchLocksAt,
  miniSeasonEnd,
  revealMessage,
  scorePrediction,
  type SeasonFixture,
} from "./rules";

const finished = (homeScore: number, awayScore: number) => ({ status: "FINISHED", homeScore, awayScore });
const predict = (homeGoals: number, awayGoals: number, booster: "joker" | "wildcard" | null = null) => ({ homeGoals, awayGoals, booster });

describe("scoring", () => {
  it("gives 5 for an exact score, 3 for the right result, 0 when wrong", () => {
    expect(scorePrediction(predict(2, 1), finished(2, 1))).toEqual({ outcome: "exact", points: 5 });
    expect(scorePrediction(predict(1, 0), finished(3, 1))).toEqual({ outcome: "result", points: 3 });
    expect(scorePrediction(predict(1, 1), finished(0, 0))).toEqual({ outcome: "result", points: 3 });
    expect(scorePrediction(predict(0, 2), finished(2, 0))).toEqual({ outcome: "wrong", points: 0 });
  });

  it("doubles the points with a Joker", () => {
    expect(scorePrediction(predict(2, 1, "joker"), finished(2, 1))).toEqual({ outcome: "exact", points: 10 });
    expect(scorePrediction(predict(1, 0, "joker"), finished(2, 0))).toEqual({ outcome: "result", points: 6 });
    expect(scorePrediction(predict(0, 1, "joker"), finished(2, 0))).toEqual({ outcome: "wrong", points: 0 });
  });

  it("turns a wrong prediction into 2 with a Wildcard and does nothing when right", () => {
    expect(scorePrediction(predict(0, 1, "wildcard"), finished(2, 0))).toEqual({ outcome: "wrong", points: 2 });
    expect(scorePrediction(predict(2, 0, "wildcard"), finished(2, 0))).toEqual({ outcome: "exact", points: 5 });
    expect(scorePrediction(predict(1, 0, "wildcard"), finished(3, 0))).toEqual({ outcome: "result", points: 3 });
  });

  it("voids postponed, cancelled and suspended matches", () => {
    for (const status of ["POSTPONED", "CANCELLED", "SUSPENDED"]) {
      expect(scorePrediction(predict(1, 0, "joker"), { status, homeScore: null, awayScore: null })).toEqual({ outcome: "void", points: 0 });
    }
  });

  it("waits while a match is still to be played or in progress", () => {
    expect(scorePrediction(predict(1, 0), { status: "TIMED", homeScore: null, awayScore: null })).toBeNull();
    expect(scorePrediction(predict(1, 0), { status: "IN_PLAY", homeScore: 1, awayScore: 0 })).toBeNull();
  });
});

describe("per-match locking", () => {
  const kickoff = new Date("2026-11-01T15:00:00.000Z");

  it("locks each match one hour before its own kickoff", () => {
    expect(matchLocksAt(kickoff).toISOString()).toBe("2026-11-01T14:00:00.000Z");
    expect(isMatchLocked(kickoff, new Date("2026-11-01T13:59:59.000Z"))).toBe(false);
    expect(isMatchLocked(kickoff, new Date("2026-11-01T14:00:00.000Z"))).toBe(true);
  });
});

describe("saving predictions", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");
  const matches = [
    { fixtureId: 1, kickoff: new Date("2026-11-01T12:30:00.000Z"), label: "Early v Match" }, // locked at 11:30
    { fixtureId: 2, kickoff: new Date("2026-11-01T15:00:00.000Z"), label: "Chelsea v Man United" },
    { fixtureId: 3, kickoff: new Date("2026-11-02T15:00:00.000Z"), label: "Arsenal v Spurs" },
  ];
  const allowance = { joker: boosterAllowance("joker"), wildcard: boosterAllowance("wildcard") };

  it("saves open matches", () => {
    const result = applyPredictionChanges({
      matches, saved: [], allowance, now,
      changes: [{ fixtureId: 2, homeGoals: 2, awayGoals: 0, booster: "joker" }, { fixtureId: 3, homeGoals: 1, awayGoals: 1, booster: "wildcard" }],
    });
    expect(result).toMatchObject({ ok: true });
    expect(result.written).toHaveLength(2);
  });

  it("refuses changes to a match after it locks, even if others are still open", () => {
    const result = applyPredictionChanges({ matches, saved: [], allowance, now, changes: [{ fixtureId: 1, homeGoals: 1, awayGoals: 0, booster: null }] });
    expect(result.errors).toEqual(["Early v Match has locked — predictions can't be changed"]);
  });

  it("accepts an unchanged locked prediction re-sent with the batch", () => {
    const saved = [{ fixtureId: 1, homeGoals: 1, awayGoals: 0, booster: null }];
    expect(applyPredictionChanges({ matches, saved, allowance, now, changes: [{ fixtureId: 1, homeGoals: 1, awayGoals: 0, booster: null }] }).ok).toBe(true);
  });

  it("allows one free Joker and one free Wildcard per gameweek", () => {
    const twoJokers = applyPredictionChanges({
      matches, saved: [], allowance, now,
      changes: [{ fixtureId: 2, homeGoals: 1, awayGoals: 0, booster: "joker" }, { fixtureId: 3, homeGoals: 1, awayGoals: 0, booster: "joker" }],
    });
    expect(twoJokers.errors).toEqual(["You can only use 1 Joker per gameweek"]);
  });

  it("counts a booster already on a locked match", () => {
    const saved = [{ fixtureId: 1, homeGoals: 1, awayGoals: 0, booster: "wildcard" as const }];
    const result = applyPredictionChanges({ matches, saved, allowance, now, changes: [{ fixtureId: 3, homeGoals: 0, awayGoals: 0, booster: "wildcard" }] });
    expect(result.errors).toEqual(["You can only use 1 Wildcard per gameweek"]);
  });

  it("lets a booster move between open matches", () => {
    const saved = [{ fixtureId: 2, homeGoals: 2, awayGoals: 0, booster: "joker" as const }];
    const result = applyPredictionChanges({
      matches, saved, allowance, now,
      changes: [{ fixtureId: 2, homeGoals: 2, awayGoals: 0, booster: null }, { fixtureId: 3, homeGoals: 1, awayGoals: 0, booster: "joker" }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects silly scores and matches from other gameweeks", () => {
    expect(applyPredictionChanges({ matches, saved: [], allowance, now, changes: [{ fixtureId: 2, homeGoals: -1, awayGoals: 0, booster: null }] }).errors)
      .toEqual(["Chelsea v Man United: scores must be whole numbers from 0 to 20"]);
    expect(applyPredictionChanges({ matches, saved: [], allowance, now, changes: [{ fixtureId: 99, homeGoals: 1, awayGoals: 0, booster: null }] }).errors)
      .toEqual(["One of the matches isn't in this gameweek"]);
  });

  it("adds purchased boosters to the free allowance (future)", () => {
    expect(boosterAllowance("joker", 2)).toBe(3);
  });
});

describe("mini-season", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");
  const fixture = (fixtureId: number, gameweek: number, kickoff: string, status = "TIMED", score: [number | null, number | null] = [null, null]): SeasonFixture =>
    ({ fixtureId, gameweek, kickoff: new Date(kickoff), status, homeScore: score[0], awayScore: score[1] });

  it("runs six gameweeks", () => {
    expect(miniSeasonEnd(9)).toBe(14);
  });

  it("is on the earliest gameweek that still has an open match", () => {
    const fixtures = [
      fixture(1, 9, "2026-10-25T15:00:00.000Z", "FINISHED", [1, 0]),
      fixture(2, 10, "2026-11-01T12:30:00.000Z"),
      fixture(3, 10, "2026-11-01T18:00:00.000Z"),
      fixture(4, 11, "2026-11-08T15:00:00.000Z"),
    ];
    expect(currentPredictorGameweek(fixtures, 9, 14, now)).toBe(10);
  });

  it("is complete only when every match is played or voided", () => {
    const fixtures = [fixture(1, 9, "2026-10-25T15:00:00.000Z", "FINISHED", [1, 0]), fixture(2, 9, "2026-10-26T15:00:00.000Z", "POSTPONED")];
    expect(isMiniSeasonComplete(fixtures, 9, 9)).toBe(true);
    expect(isMiniSeasonComplete([...fixtures, fixture(3, 9, "2026-10-27T15:00:00.000Z", "IN_PLAY", [0, 0])], 9, 9)).toBe(false);
  });
});

describe("reveal message", () => {
  it("lists everyone's prediction for a locked match", () => {
    expect(revealMessage("Chelsea v Man United", [
      { username: "rahul", homeGoals: 2, awayGoals: 0, booster: "joker" },
      { username: "meera", homeGoals: 1, awayGoals: 1, booster: null },
    ])).toBe("Chelsea v Man United locked — meera 1–1 · rahul 2–0 (Joker)");
    expect(revealMessage("A v B", [])).toBe("A v B locked — no predictions");
  });
});
