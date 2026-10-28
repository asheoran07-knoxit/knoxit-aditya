// Predictor leaderboard and end-of-mini-season payouts.

export type StandingPrediction = {
  userId: string;
  gameweek: number;
  outcome: string | null;
  points: number | null;
  booster: string | null;
};

export type StandingRow = {
  userId: string;
  username: string;
  rank: number;
  points: number;
  exact: number;
  correct: number; // correct results, exact scores included
  jokerPoints: number;
  predicted: number;
};

/** Tiebreak: points, then exact scores, then correct results, then Joker points. */
function compareRows(left: StandingRow, right: StandingRow) {
  return right.points - left.points
    || right.exact - left.exact
    || right.correct - left.correct
    || right.jokerPoints - left.jokerPoints;
}

/**
 * Ranks members on scored predictions (optionally only gameweeks up to
 * `throughGameweek`). Players level on every tiebreak share a rank
 * (1, 2, 2, 4) and are listed alphabetically.
 */
export function computeStandings(
  members: Array<{ userId: string; username: string }>,
  predictions: StandingPrediction[],
  throughGameweek?: number
): StandingRow[] {
  const rows = new Map<string, StandingRow>(members.map((member) => [member.userId, {
    userId: member.userId,
    username: member.username,
    rank: 0,
    points: 0,
    exact: 0,
    correct: 0,
    jokerPoints: 0,
    predicted: 0,
  }]));

  for (const prediction of predictions) {
    const row = rows.get(prediction.userId);
    if (!row) continue;
    if (throughGameweek !== undefined && prediction.gameweek > throughGameweek) continue;
    row.predicted += 1;
    if (prediction.points === null) continue;
    row.points += prediction.points;
    if (prediction.outcome === "exact") row.exact += 1;
    if (prediction.outcome === "exact" || prediction.outcome === "result") row.correct += 1;
    if (prediction.booster === "joker") row.jokerPoints += prediction.points;
  }

  const sorted = [...rows.values()].sort((left, right) => compareRows(left, right) || left.username.localeCompare(right.username));
  sorted.forEach((row, index) => {
    row.rank = index > 0 && compareRows(sorted[index - 1], row) === 0 ? sorted[index - 1].rank : index + 1;
  });
  return sorted;
}

/** Rank change since the previous gameweek: positive = moved up. */
export function rankMovement(current: StandingRow[], previous: StandingRow[]) {
  const before = new Map(previous.map((row) => [row.userId, row.rank]));
  return new Map(current.map((row) => [row.userId, (before.get(row.userId) ?? row.rank) - row.rank]));
}

export const PRIZE_SPLIT = [60, 30, 10] as const;

/**
 * Splits the vault 60/30/10 across 1st/2nd/3rd in whole chips. Rounding
 * leftovers, and the share of any place nobody occupies (fewer than three
 * players), go to 1st place. Tied players share the prizes of the places
 * they occupy equally; an indivisible chip goes to the alphabetically first.
 */
export function vaultPayouts(vault: number, standings: StandingRow[]) {
  const payouts = new Map<string, number>();
  if (vault <= 0 || standings.length === 0) return payouts;

  const placePrize = PRIZE_SPLIT.map((percent) => Math.floor((vault * percent) / 100));
  placePrize[0] += vault - placePrize.reduce((sum, prize) => sum + prize, 0);
  for (let place = standings.length; place < PRIZE_SPLIT.length; place++) {
    placePrize[0] += placePrize[place];
    placePrize[place] = 0;
  }

  // Group tied players; a group starting at rank r occupies places r..r+n-1.
  const groups = new Map<number, StandingRow[]>();
  for (const row of standings) groups.set(row.rank, [...(groups.get(row.rank) ?? []), row]);
  for (const [rank, group] of groups) {
    let pot = 0;
    for (let place = rank; place < rank + group.length; place++) pot += placePrize[place - 1] ?? 0;
    if (pot === 0) continue;
    const ordered = [...group].sort((left, right) => left.username.localeCompare(right.username));
    const share = Math.floor(pot / ordered.length);
    let leftover = pot - share * ordered.length;
    for (const row of ordered) {
      payouts.set(row.userId, share + (leftover > 0 ? 1 : 0));
      if (leftover > 0) leftover -= 1;
    }
  }
  return payouts;
}
