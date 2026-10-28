// Predictor game rules: per-match locks, scoring, Joker/Wildcard limits and
// the 6-gameweek mini-season. Pure functions; the routes and results engine
// do the database work.

import { ROUND_LOCK_BUFFER_MS } from "../leagueRounds";

export const MINI_SEASON_GAMEWEEKS = 6;
export const POINTS_EXACT = 5;
export const POINTS_RESULT = 3;
export const POINTS_WILDCARD_WRONG = 2;
export const MAX_GOALS = 20;

export type Booster = "joker" | "wildcard";
export const BOOSTERS: readonly Booster[] = ["joker", "wildcard"];
export const FREE_BOOSTERS_PER_GAMEWEEK: Record<Booster, number> = { joker: 1, wildcard: 1 };

export function isBooster(value: unknown): value is Booster {
  return value === "joker" || value === "wildcard";
}

export function miniSeasonEnd(startingRound: number) {
  return startingRound + MINI_SEASON_GAMEWEEKS - 1;
}

/** Each match locks one hour before its own kickoff. */
export function matchLocksAt(kickoff: Date) {
  return new Date(kickoff.getTime() - ROUND_LOCK_BUFFER_MS);
}

export function isMatchLocked(kickoff: Date, now = new Date()) {
  return matchLocksAt(kickoff) <= now;
}

// --- Scoring ----------------------------------------------------------------

export type MatchState = { status: string; homeScore: number | null; awayScore: number | null };
export type Outcome = "exact" | "result" | "wrong" | "void";

const FINISHED = new Set(["FINISHED", "AWARDED"]);
// Never played (or not finished) as scheduled: the prediction is voided.
const VOID = new Set(["POSTPONED", "CANCELLED", "SUSPENDED"]);

const resultOf = (home: number, away: number) => Math.sign(home - away);

/**
 * Points for one prediction once its match is decided; null while it's still
 * to be played. Exact score 5, correct result 3, wrong 0. A Joker doubles
 * the points; a Wildcard turns a wrong prediction into 2 (no effect if right).
 */
export function scorePrediction(
  prediction: { homeGoals: number; awayGoals: number; booster: Booster | null },
  match: MatchState
): { outcome: Outcome; points: number } | null {
  if (VOID.has(match.status)) return { outcome: "void", points: 0 };
  if (!FINISHED.has(match.status) || match.homeScore === null || match.awayScore === null) return null;

  let outcome: Outcome;
  let points: number;
  if (prediction.homeGoals === match.homeScore && prediction.awayGoals === match.awayScore) {
    outcome = "exact";
    points = POINTS_EXACT;
  } else if (resultOf(prediction.homeGoals, prediction.awayGoals) === resultOf(match.homeScore, match.awayScore)) {
    outcome = "result";
    points = POINTS_RESULT;
  } else {
    outcome = "wrong";
    points = prediction.booster === "wildcard" ? POINTS_WILDCARD_WRONG : 0;
  }
  if (prediction.booster === "joker") points *= 2;
  return { outcome, points };
}

export function isMatchDecided(match: MatchState) {
  return VOID.has(match.status) || (FINISHED.has(match.status) && match.homeScore !== null && match.awayScore !== null);
}

// --- Saving predictions -----------------------------------------------------

export type GameweekMatch = { fixtureId: number; kickoff: Date; label: string };
export type SavedPrediction = { fixtureId: number; homeGoals: number; awayGoals: number; booster: Booster | null };
export type PredictionChange = { fixtureId: number; homeGoals: number; awayGoals: number; booster: Booster | null };

/** Free boosters per gameweek plus any granted (future: purchased) ones. */
export function boosterAllowance(booster: Booster, grantedExtra = 0) {
  return FREE_BOOSTERS_PER_GAMEWEEK[booster] + Math.max(0, grantedExtra);
}

/**
 * Applies a batch of changes to a player's gameweek and checks every rule.
 * Locked matches can't be changed (their booster stays where it is); scores
 * must be whole numbers 0–20; at most `allowance` of each booster across the
 * gameweek; a match carries at most one booster by construction.
 */
export function applyPredictionChanges(params: {
  matches: GameweekMatch[];
  saved: SavedPrediction[];
  changes: PredictionChange[];
  allowance: Record<Booster, number>;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const matchById = new Map(params.matches.map((match) => [match.fixtureId, match]));
  const final = new Map(params.saved.map((prediction) => [prediction.fixtureId, prediction]));
  const errors: string[] = [];
  const written: PredictionChange[] = [];

  const seen = new Set<number>();
  for (const change of params.changes) {
    const match = matchById.get(change.fixtureId);
    if (!match) {
      errors.push("One of the matches isn't in this gameweek");
      continue;
    }
    if (seen.has(change.fixtureId)) {
      errors.push(`${match.label} appears twice`);
      continue;
    }
    seen.add(change.fixtureId);

    const previous = final.get(change.fixtureId);
    const unchanged = previous
      && previous.homeGoals === change.homeGoals
      && previous.awayGoals === change.awayGoals
      && previous.booster === change.booster;
    if (unchanged) continue;
    if (isMatchLocked(match.kickoff, now)) {
      errors.push(`${match.label} has locked — predictions can't be changed`);
      continue;
    }
    for (const goals of [change.homeGoals, change.awayGoals]) {
      if (!Number.isInteger(goals) || goals < 0 || goals > MAX_GOALS) {
        errors.push(`${match.label}: scores must be whole numbers from 0 to ${MAX_GOALS}`);
        break;
      }
    }
    if (change.booster !== null && !isBooster(change.booster)) errors.push(`${match.label}: unknown booster`);
    final.set(change.fixtureId, change);
    written.push(change);
  }

  for (const booster of BOOSTERS) {
    const used = [...final.values()].filter((prediction) => prediction.booster === booster).length;
    if (used > params.allowance[booster]) {
      const name = booster === "joker" ? "Joker" : "Wildcard";
      errors.push(`You can only use ${params.allowance[booster]} ${name}${params.allowance[booster] === 1 ? "" : "s"} per gameweek`);
    }
  }

  return { ok: errors.length === 0, errors, written };
}

// --- Gameweek progression ---------------------------------------------------

export type SeasonFixture = { fixtureId: number; gameweek: number; kickoff: Date } & MatchState;

/**
 * The gameweek players should be predicting: the earliest gameweek of the
 * mini-season that still has a match open for predictions; the final
 * gameweek once everything has locked.
 */
export function currentPredictorGameweek(fixtures: SeasonFixture[], startingRound: number, endGameweek: number, now = new Date()) {
  for (let gameweek = startingRound; gameweek <= endGameweek; gameweek++) {
    if (fixtures.some((fixture) => fixture.gameweek === gameweek && !isMatchLocked(fixture.kickoff, now))) return gameweek;
  }
  return endGameweek;
}

/** The mini-season is over once every match in it is decided (played or voided). */
export function isMiniSeasonComplete(fixtures: SeasonFixture[], startingRound: number, endGameweek: number) {
  const inSeason = fixtures.filter((fixture) => fixture.gameweek >= startingRound && fixture.gameweek <= endGameweek);
  return inSeason.length > 0 && inSeason.every(isMatchDecided);
}

/** One reveal line per locked match, e.g. "Chelsea v Man United locked — rahul 2–0 · meera 1–1". */
export function revealMessage(label: string, entries: Array<{ username: string; homeGoals: number; awayGoals: number; booster: Booster | null }>) {
  if (entries.length === 0) return `${label} locked — no predictions`;
  const parts = [...entries]
    .sort((left, right) => left.username.localeCompare(right.username))
    .map((entry) => `${entry.username} ${entry.homeGoals}–${entry.awayGoals}${entry.booster === "joker" ? " (Joker)" : entry.booster === "wildcard" ? " (Wildcard)" : ""}`);
  return `${label} locked — ${parts.join(" · ")}`;
}
