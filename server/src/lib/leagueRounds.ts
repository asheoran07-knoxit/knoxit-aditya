// Round timing rules shared by competitive cohorts and Friends Leagues.
// A round locks one hour before its first kickoff; the server derives every
// lock time from synced fixtures and never accepts one from a client.

export const ROUND_LOCK_BUFFER_MS = 60 * 60 * 1000;

// Friends League creators may start on the next open round or up to this
// many rounds after it.
export const FRIENDS_LEAGUE_MAX_ROUNDS_AHEAD = 2;

// A Friends League needs at least this many members when its first round
// locks, otherwise its start moves to the next open round.
export const FRIENDS_LEAGUE_MIN_MEMBERS_TO_START = 2;

export const LEAGUE_ALREADY_STARTED_MESSAGE = "This league has already started";

export type RoundFixture = { matchday: number | null; utcDate: Date };

export type OpenRound = {
  startingRound: number;
  firstKickoff: Date;
  locksAt: Date;
};

/** Rounds whose lock hasn't passed yet, soonest first. */
export function openRounds(fixtures: RoundFixture[], now = new Date(), limit?: number): OpenRound[] {
  const firstKickoffByRound = new Map<number, Date>();
  for (const fixture of fixtures) {
    if (fixture.matchday === null) continue;
    const current = firstKickoffByRound.get(fixture.matchday);
    if (!current || fixture.utcDate < current) firstKickoffByRound.set(fixture.matchday, fixture.utcDate);
  }

  const rounds = [...firstKickoffByRound.entries()]
    .map(([startingRound, firstKickoff]) => ({
      startingRound,
      firstKickoff,
      locksAt: new Date(firstKickoff.getTime() - ROUND_LOCK_BUFFER_MS),
    }))
    .filter((round) => round.locksAt > now)
    .sort((left, right) => left.firstKickoff.getTime() - right.firstKickoff.getTime());

  return limit === undefined ? rounds : rounds.slice(0, limit);
}

export function firstOpenRound(fixtures: RoundFixture[], now = new Date()) {
  return openRounds(fixtures, now, 1)[0] ?? null;
}

/** The rounds a Friends League creator may choose: the next open one plus up to two later. */
export function friendsLeagueStartOptions(fixtures: RoundFixture[], now = new Date()) {
  return openRounds(fixtures, now, FRIENDS_LEAGUE_MAX_ROUNDS_AHEAD + 1);
}

export function resolveFriendsLeagueStart(fixtures: RoundFixture[], startingRound: number, now = new Date()) {
  const options = friendsLeagueStartOptions(fixtures, now);
  if (options.length === 0) {
    return { ok: false as const, error: "No upcoming round is open for this competition" };
  }
  const round = options.find((option) => option.startingRound === startingRound);
  if (!round) {
    const allowed = options.map((option) => `GW${option.startingRound}`).join(", ");
    return { ok: false as const, error: `Choose a starting gameweek from: ${allowed}` };
  }
  return { ok: true as const, round };
}

/**
 * A league has started once its first lock passes. Friends Leagues that were
 * short of members get their start moved forward and stay "upcoming", so they
 * become joinable again until the new lock.
 */
export function hasLeagueStarted(league: { status: string; locksAt: Date | null }, now = new Date()) {
  if (league.status !== "upcoming") return true;
  return league.locksAt !== null && league.locksAt <= now;
}

export function shouldPostponeFriendsLeagueStart(
  league: { type: string; status: string; locksAt: Date | null },
  memberCount: number,
  now = new Date()
) {
  return league.type === "friends"
    && league.status === "upcoming"
    && league.locksAt !== null
    && league.locksAt <= now
    && memberCount < FRIENDS_LEAGUE_MIN_MEMBERS_TO_START;
}

/** The round a short-handed Friends League moves to: the next open round after its current one. */
export function postponedStartRound(fixtures: RoundFixture[], currentRound: number, now = new Date()) {
  return openRounds(fixtures, now).find((round) => round.startingRound > currentRound) ?? null;
}
