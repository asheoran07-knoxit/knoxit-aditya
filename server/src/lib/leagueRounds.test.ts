import { describe, expect, it } from "vitest";
import {
  firstOpenRound,
  friendsLeagueStartOptions,
  hasLeagueStarted,
  postponedStartRound,
  resolveFriendsLeagueStart,
  shouldPostponeFriendsLeagueStart,
} from "./leagueRounds";

const at = (iso: string) => new Date(iso);

// Rounds 10-14, one week apart, each with an early Saturday kickoff and a
// later Sunday one. Each round locks an hour before Saturday's kickoff.
const fixtures = [10, 11, 12, 13, 14].flatMap((round, index) => {
  const saturday = new Date(Date.UTC(2026, 10, 7 + index * 7, 12, 30));
  const sunday = new Date(saturday.getTime() + 26 * 60 * 60 * 1000);
  return [
    { matchday: round, utcDate: sunday },
    { matchday: round, utcDate: saturday },
  ];
});

const beforeRound10Lock = at("2026-11-07T11:00:00.000Z"); // round 10 locks 11:30
const afterRound10Lock = at("2026-11-07T11:30:00.000Z");

describe("round timing", () => {
  it("locks a round one hour before its first kickoff", () => {
    expect(firstOpenRound(fixtures, beforeRound10Lock)).toMatchObject({
      startingRound: 10,
      locksAt: at("2026-11-07T11:30:00.000Z"),
    });
  });

  it("skips a round once its lock has passed", () => {
    expect(firstOpenRound(fixtures, afterRound10Lock)?.startingRound).toBe(11);
  });

  it("ignores fixtures without a matchday", () => {
    expect(firstOpenRound([{ matchday: null, utcDate: at("2026-11-01T12:00:00.000Z") }], beforeRound10Lock)).toBeNull();
  });
});

describe("friends league start", () => {
  it("defaults to the next open round and allows up to two later", () => {
    expect(friendsLeagueStartOptions(fixtures, beforeRound10Lock).map((round) => round.startingRound)).toEqual([10, 11, 12]);
  });

  it("accepts an offered round and returns its server-derived lock", () => {
    const result = resolveFriendsLeagueStart(fixtures, 12, beforeRound10Lock);
    expect(result).toEqual({ ok: true, round: expect.objectContaining({ startingRound: 12, locksAt: at("2026-11-21T11:30:00.000Z") }) });
  });

  it("rejects a round more than two after the next open one", () => {
    expect(resolveFriendsLeagueStart(fixtures, 13, beforeRound10Lock)).toEqual({
      ok: false,
      error: "Choose a starting gameweek from: GW10, GW11, GW12",
    });
  });

  it("rejects a round that has already locked", () => {
    expect(resolveFriendsLeagueStart(fixtures, 10, afterRound10Lock).ok).toBe(false);
  });

  it("rejects when the competition has no open round", () => {
    expect(resolveFriendsLeagueStart([], 10, beforeRound10Lock)).toEqual({
      ok: false,
      error: "No upcoming round is open for this competition",
    });
  });
});

describe("joining after the first lock", () => {
  const locksAt = at("2026-11-07T11:30:00.000Z");

  it("allows joining an upcoming league before its lock", () => {
    expect(hasLeagueStarted({ status: "upcoming", locksAt }, beforeRound10Lock)).toBe(false);
  });

  it("treats the league as started from the moment it locks", () => {
    expect(hasLeagueStarted({ status: "upcoming", locksAt }, afterRound10Lock)).toBe(true);
  });

  it("treats active, completed and split leagues as started", () => {
    for (const status of ["active", "completed", "split"]) {
      expect(hasLeagueStarted({ status, locksAt: at("2027-01-01T00:00:00.000Z") }, beforeRound10Lock)).toBe(true);
    }
  });
});

describe("postponing a short-handed friends league", () => {
  const league = { type: "friends", status: "upcoming", locksAt: at("2026-11-07T11:30:00.000Z") };

  it("postpones a friends league with fewer than two members once it locks", () => {
    expect(shouldPostponeFriendsLeagueStart(league, 1, afterRound10Lock)).toBe(true);
  });

  it("starts normally with two or more members", () => {
    expect(shouldPostponeFriendsLeagueStart(league, 2, afterRound10Lock)).toBe(false);
  });

  it("does nothing before the lock, or for competitive and already-running leagues", () => {
    expect(shouldPostponeFriendsLeagueStart(league, 1, beforeRound10Lock)).toBe(false);
    expect(shouldPostponeFriendsLeagueStart({ ...league, type: "competitive" }, 1, afterRound10Lock)).toBe(false);
    expect(shouldPostponeFriendsLeagueStart({ ...league, status: "active" }, 1, afterRound10Lock)).toBe(false);
  });

  it("moves the start to the next open round", () => {
    expect(postponedStartRound(fixtures, 10, afterRound10Lock)).toMatchObject({
      startingRound: 11,
      locksAt: at("2026-11-14T11:30:00.000Z"),
    });
  });

  it("returns nothing when no later round has been synced", () => {
    expect(postponedStartRound(fixtures, 14, afterRound10Lock)).toBeNull();
  });
});
