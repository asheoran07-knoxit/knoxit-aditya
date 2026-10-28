// Predictor part of the results engine, run inside its transaction.

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@db/index";
import { footballFixtures, leagueMembers, leagues, predictions, users } from "@db/schema";
import { applyChipTransactionInTransaction } from "../chipLedger";
import { postPredictorReveals, postSystemMessage } from "../systemMessages";
import { currentPredictorGameweek, isBooster, isMiniSeasonComplete, scorePrediction, type SeasonFixture } from "./rules";
import { computeStandings, vaultPayouts } from "./standings";

type EngineTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PredictorEngineResult = { predictionsScored: number; completed: boolean; paidOut: number };

export async function loadSeasonFixtures(
  database: Pick<typeof db, "select">,
  league: { competitionKey: string | null; seasonStartYear: number | null; startingRound: number | null; endGameweek: number | null }
): Promise<SeasonFixture[]> {
  if (!league.competitionKey || league.seasonStartYear === null || league.startingRound === null || league.endGameweek === null) return [];
  const rows = await database
    .select({
      fixtureId: footballFixtures.providerId,
      gameweek: footballFixtures.matchday,
      kickoff: footballFixtures.utcDate,
      status: footballFixtures.status,
      homeScore: footballFixtures.homeScore,
      awayScore: footballFixtures.awayScore,
    })
    .from(footballFixtures)
    .where(and(
      eq(footballFixtures.competitionKey, league.competitionKey),
      eq(footballFixtures.seasonStartYear, league.seasonStartYear),
      gte(footballFixtures.matchday, league.startingRound),
      lte(footballFixtures.matchday, league.endGameweek)
    ));
  return rows.filter((row): row is SeasonFixture => row.gameweek !== null);
}

export async function processPredictorLeague(
  tx: EngineTransaction,
  league: typeof leagues.$inferSelect,
  now: Date
): Promise<PredictorEngineResult> {
  const result: PredictorEngineResult = { predictionsScored: 0, completed: false, paidOut: 0 };
  if (league.startingRound === null || league.endGameweek === null) return result;

  const fixtures = await loadSeasonFixtures(tx, league);
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  const leaguePredictions = await tx.select().from(predictions).where(eq(predictions.leagueId, league.id));

  // Score (or void) predictions whose match is decided; only write changes.
  for (const prediction of leaguePredictions) {
    const fixture = fixtureById.get(prediction.fixtureId);
    if (!fixture) continue;
    const scored = scorePrediction({ ...prediction, booster: isBooster(prediction.booster) ? prediction.booster : null }, fixture);
    const outcome = scored?.outcome ?? null;
    const points = scored?.points ?? null;
    if (outcome === prediction.outcome && points === prediction.points) continue;
    await tx.update(predictions).set({ outcome, points, updatedAt: now }).where(eq(predictions.id, prediction.id));
    prediction.outcome = outcome;
    prediction.points = points;
    if (scored) result.predictionsScored += 1;
  }

  await postPredictorReveals(tx, league, now);

  const currentGameweek = currentPredictorGameweek(fixtures, league.startingRound, league.endGameweek, now);
  if (currentGameweek !== league.currentGameweek) {
    await tx.update(leagues).set({ currentGameweek }).where(eq(leagues.id, league.id));
  }

  if (!isMiniSeasonComplete(fixtures, league.startingRound, league.endGameweek)) return result;

  // Mini-season over: final table, prizes (competitive only), close the league.
  const members = await tx
    .select({ userId: leagueMembers.userId, username: users.username })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, league.id));
  const standings = computeStandings(members, leaguePredictions);
  const payouts = league.type === "competitive" ? vaultPayouts(league.vaultChips, standings) : new Map<string, number>();

  for (const [userId, amount] of payouts) {
    if (amount <= 0) continue;
    const row = standings.find((standing) => standing.userId === userId);
    await applyChipTransactionInTransaction(tx, {
      userId,
      leagueId: league.id,
      type: "vault_payout",
      amount,
      vaultAmount: -amount,
      note: `${league.name} (${league.code}) — finished ${ordinal(row?.rank ?? 0)}`,
      reference: `predictor-final:${league.id}:${userId}`,
    });
    result.paidOut += amount;
  }

  await tx
    .update(leagues)
    .set({ status: "completed", currentGameweek: league.endGameweek, vaultChips: league.vaultChips - result.paidOut })
    .where(and(eq(leagues.id, league.id), inArray(leagues.status, ["upcoming", "active"])));

  const podium = standings.filter((row) => row.rank <= 3).map((row) => {
    const prize = payouts.get(row.userId);
    return `${ordinal(row.rank)} ${row.username} ${row.points} pts${prize ? ` (${prize.toLocaleString()} chips)` : ""}`;
  });
  await postSystemMessage(tx, league.id, {
    key: "predictor:final",
    content: `Mini-season over 🏆 ${podium.join(" · ") || "No predictions were made"}`,
  });
  result.completed = true;
  return result;
}

function ordinal(rank: number) {
  const suffix = rank % 10 === 1 && rank % 100 !== 11 ? "st" : rank % 10 === 2 && rank % 100 !== 12 ? "nd" : rank % 10 === 3 && rank % 100 !== 13 ? "rd" : "th";
  return `${rank}${suffix}`;
}
