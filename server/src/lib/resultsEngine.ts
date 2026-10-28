import { and, asc, count, eq, gt, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@db/index";
import { activeBoosters, footballFixtures, joinRequests, leagueMembers, leagues, picks, predictions, users } from "@db/schema";
import { processPredictorLeague } from "./predictor/engine";
import { miniSeasonEnd } from "./predictor/rules";
import { systemMessages } from "./chatRules";
import { postSystemMessage } from "./systemMessages";
import { fixtureForTeam, fixtureOutcomeForTeam, type TeamOutcome } from "./resultRules";
import { postponedStartRound, ROUND_LOCK_BUFFER_MS, shouldPostponeFriendsLeagueStart } from "./leagueRounds";

export type ResultsEngineSummary = {
  leaguesChecked: number;
  friendsStartsPostponed: number;
  joinRequestsAutoDeclined: number;
  noPickEliminations: number;
  picksResolved: number;
  backupsActivated: number;
  leaguesAdvanced: number;
  leaguesCompleted: number;
  predictionsScored: number;
};

export async function processFixtureResults(now = new Date()): Promise<ResultsEngineSummary> {
  const summary: ResultsEngineSummary = {
    leaguesChecked: 0,
    friendsStartsPostponed: 0,
    joinRequestsAutoDeclined: 0,
    noPickEliminations: 0,
    picksResolved: 0,
    backupsActivated: 0,
    leaguesAdvanced: 0,
    leaguesCompleted: 0,
    predictionsScored: 0,
  };

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('knoxit:results-engine'))`);

    const candidates = await tx
      .select()
      .from(leagues)
      .where(and(
        inArray(leagues.status, ["upcoming", "active"]),
        lte(leagues.locksAt, now)
      ));

    for (const league of candidates) {
      if (!league.competitionKey || league.seasonStartYear === null) continue;
      summary.leaguesChecked += 1;

      // A Friends League without enough players doesn't start: its first
      // round moves to the next open one and it stays joinable until then.
      if (league.type === "friends" && league.status === "upcoming") {
        const [{ memberCount }] = await tx
          .select({ memberCount: count() })
          .from(leagueMembers)
          .where(eq(leagueMembers.leagueId, league.id));
        if (shouldPostponeFriendsLeagueStart(league, memberCount, now)) {
          const seasonFixtures = await tx
            .select({ matchday: footballFixtures.matchday, utcDate: footballFixtures.utcDate })
            .from(footballFixtures)
            .where(and(
              eq(footballFixtures.competitionKey, league.competitionKey),
              eq(footballFixtures.seasonStartYear, league.seasonStartYear)
            ));
          const nextStart = postponedStartRound(seasonFixtures, league.currentGameweek, now);
          // With no later round synced yet, the league waits for the next sync.
          if (!nextStart) continue;

          // Picks/predictions for abandoned rounds never count, including toward used teams.
          await tx.delete(picks).where(and(eq(picks.leagueId, league.id), eq(picks.gameweek, league.currentGameweek)));
          await tx.delete(predictions).where(and(eq(predictions.leagueId, league.id), lt(predictions.gameweek, nextStart.startingRound)));
          await tx
            .update(leagues)
            .set({
              startingRound: nextStart.startingRound,
              currentGameweek: nextStart.startingRound,
              locksAt: nextStart.locksAt,
              ...(league.gameType === "predictor" ? { endGameweek: miniSeasonEnd(nextStart.startingRound) } : {}),
            })
            .where(eq(leagues.id, league.id));
          summary.friendsStartsPostponed += 1;
          continue;
        }
      }

      if (league.status === "upcoming") {
        await tx.update(leagues).set({ status: "active" }).where(eq(leagues.id, league.id));
        // Joins close for good once a league starts, so nothing still waiting
        // for approval can ever be accepted.
        const declined = await tx
          .update(joinRequests)
          .set({ status: "declined", resolvedAt: now })
          .where(and(eq(joinRequests.leagueId, league.id), eq(joinRequests.status, "pending")))
          .returning({ id: joinRequests.id });
        summary.joinRequestsAutoDeclined += declined.length;
      }

      // Predictor leagues: score predictions, reveal locked matches, and pay
      // out when the mini-season ends. No knockouts.
      if (league.gameType === "predictor") {
        const predictor = await processPredictorLeague(tx, league, now);
        summary.predictionsScored += predictor.predictionsScored;
        if (predictor.completed) summary.leaguesCompleted += 1;
        continue;
      }

      const members = await tx
        .select({ userId: leagueMembers.userId, status: leagueMembers.status, username: users.username })
        .from(leagueMembers)
        .innerJoin(users, eq(leagueMembers.userId, users.id))
        .where(eq(leagueMembers.leagueId, league.id));
      const usernameById = new Map(members.map((member) => [member.userId, member.username]));
      const aliveMembers = members.filter((member) => member.status === "alive");

      const roundPicks = await tx
        .select()
        .from(picks)
        .where(and(eq(picks.leagueId, league.id), eq(picks.gameweek, league.currentGameweek)));
      const submittedUsers = new Set(roundPicks.map((pick) => pick.userId));

      for (const member of aliveMembers) {
        if (submittedUsers.has(member.userId)) continue;
        const updated = await tx
          .update(leagueMembers)
          .set({
            status: "knocked_out",
            knockedOutAtGameweek: league.currentGameweek,
            knockoutReason: "NO_PICK_SUBMITTED",
          })
          .where(and(
            eq(leagueMembers.leagueId, league.id),
            eq(leagueMembers.userId, member.userId),
            eq(leagueMembers.status, "alive")
          ))
          .returning({ userId: leagueMembers.userId });
        summary.noPickEliminations += updated.length;
        if (updated.length) {
          await postSystemMessage(tx, league.id, systemMessages.knockedOut(member.userId, member.username, league.currentGameweek, null));
        }
      }

      const fixtures = await tx
        .select()
        .from(footballFixtures)
        .where(and(
          eq(footballFixtures.competitionKey, league.competitionKey),
          eq(footballFixtures.seasonStartYear, league.seasonStartYear),
          eq(footballFixtures.matchday, league.currentGameweek)
        ));

      for (const pick of roundPicks.filter((item) => item.result === "pending")) {
        let selectedTeam = pick.usedBackup ? pick.backupTeam : pick.primaryTeam;
        if (!selectedTeam) continue;
        let outcome = fixtureOutcomeForTeam(fixtureForTeam(fixtures, selectedTeam), selectedTeam);

        if (outcome === "no_result" && !pick.usedBackup && pick.backupTeam) {
          await tx.update(picks).set({ usedBackup: true }).where(eq(picks.id, pick.id));
          summary.backupsActivated += 1;
          selectedTeam = pick.backupTeam;
          outcome = fixtureOutcomeForTeam(fixtureForTeam(fixtures, selectedTeam), selectedTeam);
        }

        if (outcome === "pending" || outcome === "no_result") continue;
        const eliminated = await applyOutcome(tx, pick, outcome, now);
        summary.picksResolved += 1;
        if (eliminated) {
          const username = usernameById.get(pick.userId) ?? "A player";
          await postSystemMessage(tx, league.id, systemMessages.knockedOut(pick.userId, username, pick.gameweek, selectedTeam));
        }
      }

      const [{ pendingPicks }] = await tx
        .select({ pendingPicks: count() })
        .from(picks)
        .where(and(
          eq(picks.leagueId, league.id),
          eq(picks.gameweek, league.currentGameweek),
          eq(picks.result, "pending")
        ));
      if (pendingPicks > 0) continue;

      // Round fully resolved: one summary line for everyone who got through.
      const survivors = await tx
        .select({ userId: picks.userId })
        .from(picks)
        .where(and(eq(picks.leagueId, league.id), eq(picks.gameweek, league.currentGameweek), eq(picks.result, "survived")));
      if (survivors.length) {
        const names = survivors.map((row) => usernameById.get(row.userId) ?? "A player").sort((left, right) => left.localeCompare(right));
        await postSystemMessage(tx, league.id, systemMessages.survived(league.currentGameweek, names));
      }

      const [{ aliveCount }] = await tx
        .select({ aliveCount: count() })
        .from(leagueMembers)
        .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.status, "alive")));

      if (aliveCount === 1) {
        await tx.update(leagues).set({ status: "completed" }).where(eq(leagues.id, league.id));
        summary.leaguesCompleted += 1;
        continue;
      }
      // The zero-survivor policy is deliberately not guessed here. The league
      // remains on the resolved round for operations review.
      if (aliveCount === 0) continue;

      const nextFixtures = await tx
        .select({ matchday: footballFixtures.matchday, utcDate: footballFixtures.utcDate })
        .from(footballFixtures)
        .where(and(
          eq(footballFixtures.competitionKey, league.competitionKey),
          eq(footballFixtures.seasonStartYear, league.seasonStartYear),
          gt(footballFixtures.matchday, league.currentGameweek)
        ))
        .orderBy(asc(footballFixtures.matchday), asc(footballFixtures.utcDate));
      const nextRound = nextFixtures.find((fixture) => fixture.matchday !== null);
      if (!nextRound?.matchday) continue;
      const firstKickoff = nextFixtures.find((fixture) => fixture.matchday === nextRound.matchday)?.utcDate;
      if (!firstKickoff) continue;

      await tx
        .update(leagues)
        .set({
          currentGameweek: nextRound.matchday,
          locksAt: new Date(firstKickoff.getTime() - ROUND_LOCK_BUFFER_MS),
          status: "active",
        })
        .where(eq(leagues.id, league.id));
      summary.leaguesAdvanced += 1;
    }
  });

  return summary;
}

type ResultsTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyOutcome(
  tx: ResultsTransaction,
  pick: typeof picks.$inferSelect,
  outcome: Exclude<TeamOutcome, "pending" | "no_result">,
  now: Date
): Promise<boolean> {
  // Returns true when the pick knocked the player out.
  if (outcome === "win") {
    await tx.update(picks).set({ result: "survived" }).where(and(eq(picks.id, pick.id), eq(picks.result, "pending")));
    return false;
  }

  if (outcome === "draw") {
    const [shield] = await tx
      .select()
      .from(activeBoosters)
      .where(and(
        eq(activeBoosters.userId, pick.userId),
        eq(activeBoosters.leagueId, pick.leagueId),
        eq(activeBoosters.gameweek, pick.gameweek),
        eq(activeBoosters.boosterType, "draw_shield"),
        isNull(activeBoosters.consumedAt)
      ))
      .limit(1);
    if (shield) {
      await tx.update(activeBoosters).set({ consumedAt: now }).where(eq(activeBoosters.id, shield.id));
      await tx.update(picks).set({ result: "survived" }).where(and(eq(picks.id, pick.id), eq(picks.result, "pending")));
      return false;
    }
  }

  await tx.update(picks).set({ result: "eliminated" }).where(and(eq(picks.id, pick.id), eq(picks.result, "pending")));
  await tx
    .update(leagueMembers)
    .set({
      status: "knocked_out",
      knockedOutAtGameweek: pick.gameweek,
      knockoutReason: outcome === "draw" ? "PICK_DRAW" : "PICK_LOSS",
    })
    .where(and(
      eq(leagueMembers.leagueId, pick.leagueId),
      eq(leagueMembers.userId, pick.userId),
      eq(leagueMembers.status, "alive")
    ));
  return true;
}
