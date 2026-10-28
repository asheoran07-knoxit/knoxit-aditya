// Posts automatic league chat messages. Each carries a per-league key and the
// insert ignores duplicates, so callers (results engine, syncs, joins) can
// re-run without posting twice.

import { and, asc, eq, gt, gte, inArray, lte } from "drizzle-orm";
import { db } from "@db/index";
import { footballFixtures, leagueMessages, leagues, predictions, users } from "@db/schema";
import { lockReminderDue, systemMessages } from "./chatRules";
import { ROUND_LOCK_BUFFER_MS } from "./leagueRounds";
import { isBooster, revealMessage } from "./predictor/rules";

type Inserter = Pick<typeof db, "insert">;

export async function postSystemMessage(database: Inserter, leagueId: string, message: { key: string; content: string }) {
  const now = new Date();
  await database
    .insert(leagueMessages)
    .values({
      leagueId,
      userId: null,
      kind: "system",
      content: message.content,
      systemKey: message.key,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

export async function postLockReminder(
  database: Inserter,
  league: { id: string; status: string; gameType: string; currentGameweek: number; locksAt: Date | null },
  now = new Date()
) {
  // Survivor only: Predictor matches lock one by one and get reveal messages instead.
  if (league.gameType !== "survivor") return;
  if (league.status !== "upcoming" && league.status !== "active") return;
  const minutesLeft = lockReminderDue(league.locksAt, now);
  if (minutesLeft === null) return;
  await postSystemMessage(database, league.id, systemMessages.lockReminder(league.currentGameweek, minutesLeft));
}

/** "Picks lock in 1 hour" for every open league locking within the hour. */
export async function postDueLockReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 60 * 60 * 1000);
  const due = await db
    .select({ id: leagues.id, status: leagues.status, gameType: leagues.gameType, currentGameweek: leagues.currentGameweek, locksAt: leagues.locksAt })
    .from(leagues)
    .where(and(
      eq(leagues.gameType, "survivor"),
      inArray(leagues.status, ["upcoming", "active"]),
      gt(leagues.locksAt, now),
      lte(leagues.locksAt, soon)
    ));
  for (const league of due) await postLockReminder(db, league, now);
  return due.length;
}

type Reader = Pick<typeof db, "insert" | "select">;

/**
 * Predictor: once a match locks, post everyone's prediction for it to the
 * league chat ("Chelsea v Man United locked — meera 1–1 · rahul 2–0").
 * One message per match, keyed so it's never repeated.
 */
export async function postPredictorReveals(
  database: Reader,
  league: { id: string; competitionKey: string | null; seasonStartYear: number | null; startingRound: number | null; endGameweek: number | null },
  now = new Date()
) {
  if (!league.competitionKey || league.seasonStartYear === null || league.startingRound === null || league.endGameweek === null) return 0;

  // A match has locked once its kickoff is within the lock buffer of now.
  const lockedFixtures = await database
    .select({
      fixtureId: footballFixtures.providerId,
      kickoff: footballFixtures.utcDate,
      home: footballFixtures.homeTeamShortName,
      homeName: footballFixtures.homeTeamName,
      away: footballFixtures.awayTeamShortName,
      awayName: footballFixtures.awayTeamName,
    })
    .from(footballFixtures)
    .where(and(
      eq(footballFixtures.competitionKey, league.competitionKey),
      eq(footballFixtures.seasonStartYear, league.seasonStartYear),
      gte(footballFixtures.matchday, league.startingRound),
      lte(footballFixtures.matchday, league.endGameweek),
      lte(footballFixtures.utcDate, new Date(now.getTime() + ROUND_LOCK_BUFFER_MS))
    ))
    .orderBy(asc(footballFixtures.utcDate));
  if (lockedFixtures.length === 0) return 0;

  const keyFor = (fixtureId: number) => `plock:${fixtureId}`;
  const posted = await database
    .select({ key: leagueMessages.systemKey })
    .from(leagueMessages)
    .where(and(eq(leagueMessages.leagueId, league.id), inArray(leagueMessages.systemKey, lockedFixtures.map((fixture) => keyFor(fixture.fixtureId)))));
  const postedKeys = new Set(posted.map((row) => row.key));
  const missing = lockedFixtures.filter((fixture) => !postedKeys.has(keyFor(fixture.fixtureId)));
  if (missing.length === 0) return 0;

  const entries = await database
    .select({
      fixtureId: predictions.fixtureId,
      username: users.username,
      homeGoals: predictions.homeGoals,
      awayGoals: predictions.awayGoals,
      booster: predictions.booster,
    })
    .from(predictions)
    .innerJoin(users, eq(predictions.userId, users.id))
    .where(and(eq(predictions.leagueId, league.id), inArray(predictions.fixtureId, missing.map((fixture) => fixture.fixtureId))));

  await database
    .insert(leagueMessages)
    .values(missing.map((fixture, index) => {
      // Keep chat order matching kickoff order.
      const at = new Date(now.getTime() + index);
      const label = `${fixture.home ?? fixture.homeName} v ${fixture.away ?? fixture.awayName}`;
      const lines = entries
        .filter((entry) => entry.fixtureId === fixture.fixtureId)
        .map((entry) => ({ ...entry, booster: isBooster(entry.booster) ? entry.booster : null }));
      return {
        leagueId: league.id,
        userId: null,
        kind: "system",
        content: revealMessage(label, lines),
        systemKey: keyFor(fixture.fixtureId),
        createdAt: at,
        updatedAt: at,
      };
    }))
    .onConflictDoNothing();
  return missing.length;
}
