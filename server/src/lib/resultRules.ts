export type TeamOutcome = "win" | "draw" | "loss" | "no_result" | "pending";

export type ResultFixture = {
  status: string;
  winner: string | null;
  homeTeamName: string;
  awayTeamName: string;
};

const NO_RESULT_STATUSES = new Set(["POSTPONED", "CANCELLED", "SUSPENDED", "ABANDONED"]);

export function fixtureOutcomeForTeam(fixture: ResultFixture | undefined, team: string): TeamOutcome {
  if (!fixture) return "pending";
  if (NO_RESULT_STATUSES.has(fixture.status.toUpperCase())) return "no_result";
  if (fixture.status.toUpperCase() !== "FINISHED") return "pending";
  if (fixture.winner === "DRAW") return "draw";

  const isHome = fixture.homeTeamName === team;
  const isAway = fixture.awayTeamName === team;
  if (!isHome && !isAway) return "pending";

  if (fixture.winner === "HOME_TEAM") return isHome ? "win" : "loss";
  if (fixture.winner === "AWAY_TEAM") return isAway ? "win" : "loss";
  return "pending";
}

export function fixtureForTeam<T extends Pick<ResultFixture, "homeTeamName" | "awayTeamName">>(
  fixtures: T[],
  team: string
) {
  return fixtures.find((fixture) => fixture.homeTeamName === team || fixture.awayTeamName === team);
}
