import { describe, expect, it } from "vitest";
import { computeStandings, rankMovement, vaultPayouts, type StandingPrediction } from "./standings";

const members = ["ana", "ben", "cy", "dev"].map((username) => ({ userId: username, username }));
const p = (userId: string, gameweek: number, outcome: string | null, points: number | null, booster: string | null = null): StandingPrediction =>
  ({ userId, gameweek, outcome, points, booster });

describe("leaderboard", () => {
  it("ranks by points, then exact scores, then correct results, then Joker points", () => {
    const standings = computeStandings(members, [
      // ana and ben both 10 points; ana has 2 exact vs ben's 1
      p("ana", 9, "exact", 5), p("ana", 9, "exact", 5),
      p("ben", 9, "exact", 5), p("ben", 9, "result", 3), p("ben", 9, "wrong", 2, "wildcard"),
      // cy and dev: 6 points, 0 exact, 2 correct each; dev's came with a Joker
      p("cy", 9, "result", 3), p("cy", 9, "result", 3),
      p("dev", 9, "result", 6, "joker"), p("dev", 9, "result", 0), // second "result" scored 0 only for the test's tie
    ]);
    expect(standings.map((row) => `${row.rank}:${row.username}`)).toEqual(["1:ana", "2:ben", "3:dev", "4:cy"]);
    expect(standings[0]).toMatchObject({ points: 10, exact: 2, correct: 2, jokerPoints: 0 });
  });

  it("gives players level on every tiebreak the same rank", () => {
    const standings = computeStandings(members.slice(0, 3), [p("ana", 9, "exact", 5), p("ben", 9, "exact", 5)]);
    expect(standings.map((row) => `${row.rank}:${row.username}`)).toEqual(["1:ana", "1:ben", "3:cy"]);
  });

  it("ignores unscored predictions and counts a missed prediction as nothing", () => {
    const standings = computeStandings(members.slice(0, 2), [p("ana", 9, null, null), p("ben", 9, "void", 0)]);
    expect(standings.every((row) => row.points === 0)).toBe(true);
    expect(standings.find((row) => row.userId === "ana")).toMatchObject({ predicted: 1 });
  });

  it("shows weekly movement against the previous gameweek's table", () => {
    const predictions = [p("ana", 9, "exact", 5), p("ben", 9, "wrong", 0), p("ben", 10, "exact", 10, "joker")];
    const movement = rankMovement(computeStandings(members.slice(0, 2), predictions), computeStandings(members.slice(0, 2), predictions, 9));
    expect(movement.get("ben")).toBe(1);
    expect(movement.get("ana")).toBe(-1);
  });
});

describe("vault payouts", () => {
  const ranked = (...ranks: number[]) => ranks.map((rank, index) => ({
    userId: `u${index}`, username: `u${index}`, rank, points: 0, exact: 0, correct: 0, jokerPoints: 0, predicted: 0,
  }));

  it("splits 60/30/10 across the top three", () => {
    const payouts = vaultPayouts(10_000, ranked(1, 2, 3, 4));
    expect([...payouts]).toEqual([["u0", 6000], ["u1", 3000], ["u2", 1000]]);
  });

  it("shares the prizes of the places tied players occupy", () => {
    // Two tied for 1st share 60% + 30%; 3rd keeps 10%.
    expect([...vaultPayouts(10_000, ranked(1, 1, 3, 4))]).toEqual([["u0", 4500], ["u1", 4500], ["u2", 1000]]);
    // Three tied for 2nd share 30% + 10% + 0% (3,600 / 3).
    expect([...vaultPayouts(9_000, ranked(1, 2, 2, 2))]).toEqual([["u0", 5400], ["u1", 1200], ["u2", 1200], ["u3", 1200]]);
  });

  it("pays out every chip, giving rounding leftovers to the top", () => {
    const payouts = vaultPayouts(1_001, ranked(1, 2, 3));
    expect([...payouts.values()].reduce((sum, value) => sum + value, 0)).toBe(1_001);
    expect(payouts.get("u0")).toBe(601);
  });

  it("gives an empty place's share to 1st when fewer than three play", () => {
    expect([...vaultPayouts(1_000, ranked(1, 2))]).toEqual([["u0", 700], ["u1", 300]]);
  });

  it("splits an indivisible tie fairly, one extra chip to the alphabetically first", () => {
    const payouts = vaultPayouts(1_000, ranked(1, 1, 1));
    expect([...payouts.values()]).toEqual([334, 333, 333]);
  });
});
