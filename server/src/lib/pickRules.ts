export type PickSelection = {
  primaryTeam: string;
  backupTeam: string | null;
};

export function usedTeamsInCurrentCycle(history: PickSelection[], poolSize: number) {
  let used = new Set<string>();

  for (const pick of history) {
    if (used.size >= poolSize) used = new Set<string>();
    used.add(pick.primaryTeam);
    if (pick.backupTeam) used.add(pick.backupTeam);
  }

  return used;
}

export function samePickSelection(
  existing: PickSelection,
  requested: { primaryTeam: string; backupTeam?: string }
) {
  return existing.primaryTeam === requested.primaryTeam
    && existing.backupTeam === (requested.backupTeam ?? null);
}

export type GameweekFixture = {
  matchday: number | null;
  utcDate: Date;
  homeTeamName: string;
  homeTeamShortName: string | null;
  awayTeamName: string;
  awayTeamShortName: string | null;
};

export type TeamOpponent = { opponent: string; opponentShortName: string | null; home: boolean; kickoff: Date };

/**
 * Each team's opponent in a gameweek, keyed by team name. If a team somehow
 * plays twice in the same gameweek, its earliest match is the one shown.
 */
export function opponentsForGameweek(fixtures: GameweekFixture[], gameweek: number) {
  const opponents = new Map<string, TeamOpponent>();
  const matches = fixtures
    .filter((fixture) => fixture.matchday === gameweek)
    .sort((left, right) => left.utcDate.getTime() - right.utcDate.getTime());
  for (const fixture of matches) {
    if (!opponents.has(fixture.homeTeamName)) {
      opponents.set(fixture.homeTeamName, { opponent: fixture.awayTeamName, opponentShortName: fixture.awayTeamShortName, home: true, kickoff: fixture.utcDate });
    }
    if (!opponents.has(fixture.awayTeamName)) {
      opponents.set(fixture.awayTeamName, { opponent: fixture.homeTeamName, opponentShortName: fixture.homeTeamShortName, home: false, kickoff: fixture.utcDate });
    }
  }
  return opponents;
}
