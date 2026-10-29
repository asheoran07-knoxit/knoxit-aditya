// Predictor game routes. Members of a Predictor league only; every rule
// (per-match locks, one free Joker and Wildcard per gameweek, score range,
// mini-season range) is enforced here, not just in the app.

import { Router, type NextFunction, type Request, type Response } from "express";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import { chipLedger, footballFixtures, leagueMembers, leagues, predictions, predictorBoosterGrants, users } from "@db/schema";
import { savePredictionsSchema } from "@api-zod/knoxit-schemas";
import { postPredictorReveals } from "../lib/systemMessages";
import { loadSeasonFixtures } from "../lib/predictor/engine";
import {
  applyPredictionChanges,
  boosterAllowance,
  BOOSTERS,
  currentPredictorGameweek,
  isBooster,
  isMatchLocked,
  matchLocksAt,
  type Booster,
} from "../lib/predictor/rules";
import { computeStandings, PRIZE_SPLIT, rankMovement, vaultPayouts } from "../lib/predictor/standings";

export const predictorRouter = Router();

const uuid = z.string().uuid();

class PredictorError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function loadPredictorLeague(leagueId: string, userId: string) {
  if (!uuid.safeParse(leagueId).success) throw new PredictorError(400, "Invalid league id");
  const [row] = await db
    .select({ league: leagues, memberUserId: leagueMembers.userId })
    .from(leagues)
    .leftJoin(leagueMembers, and(eq(leagueMembers.leagueId, leagues.id), eq(leagueMembers.userId, userId)))
    .where(eq(leagues.id, leagueId));
  if (!row) throw new PredictorError(404, "League not found");
  if (!row.memberUserId) throw new PredictorError(403, "You are not a member of this league");
  if (row.league.gameType !== "predictor") throw new PredictorError(409, "This is a Survivor league");
  return row.league;
}

// Turns a PredictorError into its HTTP status; anything else goes to Express.
function handle(handler: (req: Request, res: Response) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof PredictorError) return res.status(error.status).json({ error: error.message });
      next(error);
    }
  };
}

async function gameweekMatches(league: typeof leagues.$inferSelect, gameweek: number) {
  if (!league.competitionKey || league.seasonStartYear === null) return [];
  return db
    .select()
    .from(footballFixtures)
    .where(and(
      eq(footballFixtures.competitionKey, league.competitionKey),
      eq(footballFixtures.seasonStartYear, league.seasonStartYear),
      eq(footballFixtures.matchday, gameweek)
    ))
    .orderBy(asc(footballFixtures.utcDate), asc(footballFixtures.providerId));
}

async function miniSeasonMatches(league: typeof leagues.$inferSelect) {
  if (!league.competitionKey || league.seasonStartYear === null || league.startingRound === null || league.endGameweek === null) return [];
  return db
    .select()
    .from(footballFixtures)
    .where(and(
      eq(footballFixtures.competitionKey, league.competitionKey),
      eq(footballFixtures.seasonStartYear, league.seasonStartYear),
      gte(footballFixtures.matchday, league.startingRound),
      lte(footballFixtures.matchday, league.endGameweek)
    ))
    .orderBy(asc(footballFixtures.utcDate), asc(footballFixtures.providerId));
}

async function allowanceFor(leagueId: string, userId: string, gameweek: number) {
  const grants = await db
    .select({ booster: predictorBoosterGrants.booster, quantity: sql<number>`sum(${predictorBoosterGrants.quantity})::int` })
    .from(predictorBoosterGrants)
    .where(and(
      eq(predictorBoosterGrants.leagueId, leagueId),
      eq(predictorBoosterGrants.userId, userId),
      or(isNull(predictorBoosterGrants.gameweek), eq(predictorBoosterGrants.gameweek, gameweek))
    ))
    .groupBy(predictorBoosterGrants.booster);
  const extra = new Map(grants.map((grant) => [grant.booster, grant.quantity]));
  return Object.fromEntries(BOOSTERS.map((booster) => [booster, boosterAllowance(booster, extra.get(booster) ?? 0)])) as Record<Booster, number>;
}

const label = (fixture: typeof footballFixtures.$inferSelect) =>
  `${fixture.homeTeamShortName ?? fixture.homeTeamName} v ${fixture.awayTeamShortName ?? fixture.awayTeamName}`;

// ---------------------------------------------------------------------------
// GET /api/predictor/dashboard — predictions still to make, per league.
// Powers Home's Predictor card and the Picks tab.
// ---------------------------------------------------------------------------

predictorRouter.get("/dashboard", handle(async (req, res) => {
  const userId = req.userId as string;
  const now = new Date();
  const memberships = await db
    .select({ league: leagues })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(and(eq(leagueMembers.userId, userId), eq(leagues.gameType, "predictor"), inArray(leagues.status, ["upcoming", "active"])));
  const leagueIds = memberships.map((row) => row.league.id);
  // The player's predictions and each league's fixtures are independent reads.
  const [mine, seasonFixtures] = await Promise.all([
    leagueIds.length
      ? db.select({ leagueId: predictions.leagueId, fixtureId: predictions.fixtureId }).from(predictions)
          .where(and(eq(predictions.userId, userId), inArray(predictions.leagueId, leagueIds)))
      : Promise.resolve([]),
    Promise.all(memberships.map(({ league }) => loadSeasonFixtures(db, league))),
  ]);

  const items = memberships.map(({ league }, index) => {
    const fixtures = seasonFixtures[index];
    const gameweek = league.startingRound !== null && league.endGameweek !== null
      ? currentPredictorGameweek(fixtures, league.startingRound, league.endGameweek, now)
      : league.currentGameweek;
    const predicted = new Set(mine.filter((row) => row.leagueId === league.id).map((row) => row.fixtureId));
    const matches = fixtures.filter((fixture) => fixture.gameweek === gameweek);
    const open = matches.filter((fixture) => !isMatchLocked(fixture.kickoff, now));
    const toPredict = open.filter((fixture) => !predicted.has(fixture.fixtureId));
    const nextLock = (toPredict.length ? toPredict : open)
      .map((fixture) => matchLocksAt(fixture.kickoff))
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
    return {
      leagueId: league.id,
      leagueName: league.name,
      code: league.code,
      competitionKey: league.competitionKey,
      gameweek,
      totalMatches: matches.length,
      predictedMatches: matches.filter((fixture) => predicted.has(fixture.fixtureId)).length,
      toPredict: toPredict.length,
      nextLock,
    };
  });

  res.json({ serverNow: now, items });
}));

// ---------------------------------------------------------------------------
// GET /api/predictor/:leagueId/gameweek?gw= — the Predict screen.
// ---------------------------------------------------------------------------

predictorRouter.get("/:leagueId/gameweek", handle(async (req, res) => {
  const userId = req.userId as string;
  const now = new Date();
  const league = await loadPredictorLeague(String(req.params.leagueId), userId);
  if (league.startingRound === null || league.endGameweek === null) throw new PredictorError(409, "This league has no mini-season yet");

  // The whole mini-season's fixtures in one read (it's only a few dozen
  // matches), alongside the chat reveals, instead of separate sequential
  // reads for the season and the gameweek.
  const [, seasonRows] = await Promise.all([
    postPredictorReveals(db, league, now),
    miniSeasonMatches(league),
  ]);
  const seasonFixtures = seasonRows.flatMap((row) => row.matchday === null ? [] : [{
    fixtureId: row.providerId,
    gameweek: row.matchday,
    kickoff: row.utcDate,
    status: row.status,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
  }]);
  const current = currentPredictorGameweek(seasonFixtures, league.startingRound, league.endGameweek, now);
  const requested = Number(req.query.gw);
  const gameweek = Number.isInteger(requested) && requested >= league.startingRound && requested <= league.endGameweek ? requested : current;

  const matches = seasonRows.filter((row) => row.matchday === gameweek);
  const fixtureIds = matches.map((match) => match.providerId);
  const [rows, allowance] = await Promise.all([
    fixtureIds.length
      ? db
          .select({
            userId: predictions.userId,
            username: users.username,
            fixtureId: predictions.fixtureId,
            homeGoals: predictions.homeGoals,
            awayGoals: predictions.awayGoals,
            booster: predictions.booster,
            outcome: predictions.outcome,
            points: predictions.points,
          })
          .from(predictions)
          .innerJoin(users, eq(predictions.userId, users.id))
          .where(and(eq(predictions.leagueId, league.id), inArray(predictions.fixtureId, fixtureIds)))
      : Promise.resolve([]),
    allowanceFor(league.id, userId, gameweek),
  ]);

  const open = league.status === "upcoming" || league.status === "active";
  const payload = matches.map((match) => {
    const locked = isMatchLocked(match.utcDate, now);
    const mine = rows.find((row) => row.fixtureId === match.providerId && row.userId === userId) ?? null;
    return {
      fixtureId: match.providerId,
      kickoff: match.utcDate,
      locksAt: matchLocksAt(match.utcDate),
      locked,
      status: match.status,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      home: { name: match.homeTeamName, shortName: match.homeTeamShortName, crest: match.homeTeamCrest },
      away: { name: match.awayTeamName, shortName: match.awayTeamShortName, crest: match.awayTeamCrest },
      myPrediction: mine && {
        homeGoals: mine.homeGoals,
        awayGoals: mine.awayGoals,
        booster: isBooster(mine.booster) ? mine.booster : null,
        outcome: mine.outcome,
        points: mine.points,
      },
      // Everyone's predictions are visible to members only once the match locks.
      revealed: locked
        ? rows
            .filter((row) => row.fixtureId === match.providerId)
            .sort((left, right) => left.username.localeCompare(right.username))
            .map((row) => ({ userId: row.userId, username: row.username, homeGoals: row.homeGoals, awayGoals: row.awayGoals, booster: row.booster, points: row.points }))
        : [],
    };
  });

  res.json({
    leagueId: league.id,
    leagueName: league.name,
    status: league.status,
    gameweek,
    currentGameweek: current,
    startingRound: league.startingRound,
    endGameweek: league.endGameweek,
    canEdit: open,
    allowance,
    serverNow: now,
    matches: payload,
  });
}));

// ---------------------------------------------------------------------------
// PUT /api/predictor/:leagueId/predictions — save a gameweek's predictions.
// ---------------------------------------------------------------------------

predictorRouter.put("/:leagueId/predictions", handle(async (req, res) => {
  const userId = req.userId as string;
  const parsed = savePredictionsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid predictions", details: parsed.error.flatten() });
  const { gameweek, predictions: changes } = parsed.data;

  const league = await loadPredictorLeague(String(req.params.leagueId), userId);
  if (league.status !== "upcoming" && league.status !== "active") throw new PredictorError(409, "This mini-season has finished");
  if (league.startingRound === null || league.endGameweek === null || gameweek < league.startingRound || gameweek > league.endGameweek) {
    throw new PredictorError(400, `GW${gameweek} isn't part of this mini-season`);
  }

  const [matches, allowance] = await Promise.all([gameweekMatches(league, gameweek), allowanceFor(league.id, userId, gameweek)]);
  const saved = await db.transaction(async (tx) => {
    // One save at a time per player and gameweek, so booster counts can't race.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`predict:${userId}:${league.id}:${gameweek}`}))`);
    const existing = matches.length
      ? await tx
          .select({ fixtureId: predictions.fixtureId, homeGoals: predictions.homeGoals, awayGoals: predictions.awayGoals, booster: predictions.booster })
          .from(predictions)
          .where(and(eq(predictions.leagueId, league.id), eq(predictions.userId, userId), inArray(predictions.fixtureId, matches.map((match) => match.providerId))))
      : [];

    const result = applyPredictionChanges({
      matches: matches.map((match) => ({ fixtureId: match.providerId, kickoff: match.utcDate, label: label(match) })),
      saved: existing.map((row) => ({ ...row, booster: isBooster(row.booster) ? row.booster : null })),
      changes: changes.map((change) => ({ ...change, booster: change.booster ?? null })),
      allowance,
    });
    if (!result.ok) throw new PredictorError(400, result.errors[0]);
    if (result.written.length === 0) return 0;

    const now = new Date();
    await tx
      .insert(predictions)
      .values(result.written.map((change) => ({
        leagueId: league.id,
        userId,
        fixtureId: change.fixtureId,
        gameweek,
        homeGoals: change.homeGoals,
        awayGoals: change.awayGoals,
        booster: change.booster,
        updatedAt: now,
      })))
      .onConflictDoUpdate({
        target: [predictions.leagueId, predictions.userId, predictions.fixtureId],
        set: {
          homeGoals: sql`excluded.home_goals`,
          awayGoals: sql`excluded.away_goals`,
          booster: sql`excluded.booster`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
    return result.written.length;
  });

  res.json({ saved });
}));

// ---------------------------------------------------------------------------
// GET /api/predictor/:leagueId/leaderboard
// ---------------------------------------------------------------------------

predictorRouter.get("/:leagueId/leaderboard", handle(async (req, res) => {
  const userId = req.userId as string;
  const league = await loadPredictorLeague(String(req.params.leagueId), userId);

  const [, members, leaguePredictions] = await Promise.all([
    postPredictorReveals(db, league),
    db
      .select({ userId: leagueMembers.userId, username: users.username })
      .from(leagueMembers)
      .innerJoin(users, eq(leagueMembers.userId, users.id))
      .where(eq(leagueMembers.leagueId, league.id)),
    db
      .select({ userId: predictions.userId, gameweek: predictions.gameweek, outcome: predictions.outcome, points: predictions.points, booster: predictions.booster })
      .from(predictions)
      .where(eq(predictions.leagueId, league.id)),
  ]);

  const standings = computeStandings(members, leaguePredictions);
  // Movement compares against the table before the latest scored gameweek.
  const scoredGameweeks = leaguePredictions.filter((row) => row.points !== null).map((row) => row.gameweek);
  const latestScored = scoredGameweeks.length ? Math.max(...scoredGameweeks) : null;
  const movement = latestScored !== null && league.startingRound !== null && latestScored > league.startingRound
    ? rankMovement(standings, computeStandings(members, leaguePredictions, latestScored - 1))
    : new Map<string, number>();
  // Finished: show what was actually paid (from the chip ledger). Otherwise
  // what each player would win if the mini-season ended now.
  const final = league.status === "completed";
  const prizes = new Map<string, number>();
  if (league.type === "competitive" && final) {
    const paid = await db
      .select({ userId: chipLedger.userId, amount: chipLedger.amount })
      .from(chipLedger)
      .where(and(eq(chipLedger.leagueId, league.id), eq(chipLedger.type, "vault_payout")));
    for (const row of paid) prizes.set(row.userId, (prizes.get(row.userId) ?? 0) + row.amount);
  } else if (league.type === "competitive") {
    for (const [prizeUser, amount] of vaultPayouts(league.vaultChips, standings)) prizes.set(prizeUser, amount);
  }
  const prizePool = final ? [...prizes.values()].reduce((sum, amount) => sum + amount, 0) : league.vaultChips;

  res.json({
    leagueId: league.id,
    leagueName: league.name,
    status: league.status,
    final,
    startingRound: league.startingRound,
    endGameweek: league.endGameweek,
    vaultChips: league.type === "competitive" ? prizePool : null,
    prizeSplit: league.type === "competitive" ? PRIZE_SPLIT : null,
    rows: standings.map((row) => ({
      ...row,
      movement: movement.get(row.userId) ?? 0,
      isYou: row.userId === userId,
      projectedPrize: prizes.get(row.userId) ?? 0,
    })),
  });
}));

