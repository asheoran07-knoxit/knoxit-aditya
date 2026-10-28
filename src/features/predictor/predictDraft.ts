import type { PredictorBooster, PredictorMatch } from "../../services/api/knoxitApi";

export type DraftEntry = { home: number | null; away: number | null; booster: PredictorBooster | null };
export type Draft = Record<number, DraftEntry>;

export function draftFromMatches(matches: PredictorMatch[]): Draft {
  return Object.fromEntries(matches.map((match) => [match.fixtureId, {
    home: match.myPrediction?.homeGoals ?? null,
    away: match.myPrediction?.awayGoals ?? null,
    booster: match.myPrediction?.booster ?? null,
  }]));
}

const empty: DraftEntry = { home: null, away: null, booster: null };

/** +/− on one side's score. The first tap on an empty match starts it at 0–0. */
export function stepScore(draft: Draft, fixtureId: number, side: "home" | "away", delta: 1 | -1): Draft {
  const entry = draft[fixtureId] ?? empty;
  const start = { home: entry.home ?? 0, away: entry.away ?? 0 };
  const firstTouch = entry.home === null || entry.away === null;
  const value = Math.min(20, Math.max(0, start[side] + (firstTouch && delta === -1 ? 0 : delta)));
  return { ...draft, [fixtureId]: { ...entry, ...start, [side]: value } };
}

/**
 * Puts a Joker or Wildcard on a match, moving it off any other open match
 * (one of each per gameweek) and replacing the match's other booster.
 * Tapping the active booster again removes it. Returns an error when the
 * booster is already used on a match that has locked.
 */
export function toggleBooster(draft: Draft, matches: PredictorMatch[], fixtureId: number, booster: PredictorBooster, allowance: number) {
  const entry = draft[fixtureId] ?? empty;
  if (entry.booster === booster) return { draft: { ...draft, [fixtureId]: { ...entry, booster: null } }, error: null };

  const lockedById = new Map(matches.map((match) => [match.fixtureId, match.locked]));
  const holders = Object.entries(draft).filter(([id, value]) => Number(id) !== fixtureId && value.booster === booster);
  const next: Draft = { ...draft };
  if (holders.length >= allowance) {
    const movable = holders.find(([id]) => !lockedById.get(Number(id)));
    const name = booster === "joker" ? "Joker" : "Wildcard";
    if (!movable) return { draft, error: `Your ${name} is on a match that has locked` };
    next[Number(movable[0])] = { ...movable[1], booster: null };
  }
  next[fixtureId] = { home: entry.home ?? 0, away: entry.away ?? 0, booster };
  return { draft: next, error: null };
}

export function countPredicted(draft: Draft, matches: PredictorMatch[]) {
  return matches.filter((match) => {
    const entry = draft[match.fixtureId];
    return entry && entry.home !== null && entry.away !== null;
  }).length;
}

/** Open matches whose draft differs from what the server has. */
export function changedPredictions(draft: Draft, matches: PredictorMatch[]) {
  return matches
    .filter((match) => !match.locked)
    .map((match) => ({ match, entry: draft[match.fixtureId] }))
    .filter(({ match, entry }) => entry && entry.home !== null && entry.away !== null && (
      entry.home !== match.myPrediction?.homeGoals
      || entry.away !== match.myPrediction?.awayGoals
      || entry.booster !== (match.myPrediction?.booster ?? null)
    ))
    .map(({ match, entry }) => ({ fixtureId: match.fixtureId, homeGoals: entry.home as number, awayGoals: entry.away as number, booster: entry.booster }));
}
