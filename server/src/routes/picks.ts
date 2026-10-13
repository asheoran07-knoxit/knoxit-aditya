// artifacts/api-server/src/routes/picks.ts
//
// Handles pick submission, including:
//   1. "Can't pick the same team twice" within a cycle
//   2. Pool-exhaustion reset — once a player has used every team in the
//      sport's pool, the pool resets and they can pick any team again
//      (per your 25 Jul 2026 discussion: leagues can run longer than the
//      team pool, so it must cycle rather than lock players out).
//
// The league's UTC gameweek lock is enforced inside the same transaction as
// submission so delayed clients cannot write after the window closes.

import { Router } from "express";
import { eq, and, asc, isNull, lt, sql } from "drizzle-orm";
import { db } from "@db/index";
import { picks, leagues, leagueMembers, activeBoosters, footballFixtures } from "@db/schema";
import { joinLeagueSchema, submitPickSchema } from "@api-zod/knoxit-schemas";
import { samePickSelection, usedTeamsInCurrentCycle } from "../lib/pickRules";

export const picksRouter = Router();

// ---------------------------------------------------------------------------
// Team pools are derived from the provider-backed fixture cache for the
// league's competition and season.
// ---------------------------------------------------------------------------

type PickDatabase = Pick<typeof db, "select">;

type PickTeam = {
  id: number | null;
  name: string;
  shortName: string | null;
  crest: string | null;
};

class PickSubmissionError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PickSubmissionError";
  }
}

async function getLeagueTeamPool(database: PickDatabase, league: typeof leagues.$inferSelect) {
  if (!league.competitionKey) return [];

  const conditions = [eq(footballFixtures.competitionKey, league.competitionKey)];
  if (league.seasonStartYear !== null) conditions.push(eq(footballFixtures.seasonStartYear, league.seasonStartYear));

  const fixtures = await database
    .select({
      homeTeamId: footballFixtures.homeTeamId,
      homeTeamName: footballFixtures.homeTeamName,
      homeTeamShortName: footballFixtures.homeTeamShortName,
      homeTeamCrest: footballFixtures.homeTeamCrest,
      awayTeamId: footballFixtures.awayTeamId,
      awayTeamName: footballFixtures.awayTeamName,
      awayTeamShortName: footballFixtures.awayTeamShortName,
      awayTeamCrest: footballFixtures.awayTeamCrest,
    })
    .from(footballFixtures)
    .where(and(...conditions));

  const teams = new Map<string, PickTeam>();
  for (const fixture of fixtures) {
    const home: PickTeam = {
      id: fixture.homeTeamId,
      name: fixture.homeTeamName,
      shortName: fixture.homeTeamShortName,
      crest: fixture.homeTeamCrest,
    };
    const away: PickTeam = {
      id: fixture.awayTeamId,
      name: fixture.awayTeamName,
      shortName: fixture.awayTeamShortName,
      crest: fixture.awayTeamCrest,
    };
    teams.set(home.id === null ? `name:${home.name}` : `id:${home.id}`, home);
    teams.set(away.id === null ? `name:${away.name}` : `id:${away.id}`, away);
  }

  return Array.from(teams.values()).sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * Walks a user's pick history for a league in submission order and figures
 * out which teams are "used" in the *current* cycle. Whenever the used-set
 * reaches the full pool size, the cycle resets and a fresh empty set starts
 * for picks after that point.
 */
async function getUsedTeamsThisCycle(
  database: PickDatabase,
  userId: string,
  leagueId: string,
  gameweek: number,
  poolSize: number
) {
  const history = await database
    .select({ primaryTeam: picks.primaryTeam, backupTeam: picks.backupTeam })
    .from(picks)
    .where(and(
      eq(picks.leagueId, leagueId),
      eq(picks.userId, userId),
      lt(picks.gameweek, gameweek)
    ))
    .orderBy(asc(picks.submittedAt));
  return usedTeamsInCurrentCycle(history, poolSize);
}

// ---------------------------------------------------------------------------
// GET /api/picks/available-teams/:leagueId powers the Pick Submission screen,
// showing which teams are still pickable vs. used this cycle
// ---------------------------------------------------------------------------

picksRouter.get("/available-teams/:leagueId", async (req, res) => {
  const userId = req.userId as string;
  const leagueId = req.params.leagueId;

  const parsed = joinLeagueSchema.safeParse({ leagueId });
  if (!parsed.success) return res.status(400).json({ error: "Invalid league id" });

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) return res.status(404).json({ error: "League not found" });

  const [membership] = await db
    .select({ status: leagueMembers.status })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
    .limit(1);
  if (!membership) return res.status(403).json({ error: "Not a member of this league" });

  const pool = await getLeagueTeamPool(db, league);
  const usedThisCycle = pool.length
    ? await getUsedTeamsThisCycle(db, userId, leagueId, league.currentGameweek, pool.length)
    : new Set<string>();
  const [currentPick] = await db
    .select()
    .from(picks)
    .where(and(
      eq(picks.leagueId, leagueId),
      eq(picks.userId, userId),
      eq(picks.gameweek, league.currentGameweek)
    ))
    .limit(1);
  const serverNow = new Date();
  const isOpen = league.status === "upcoming" || league.status === "active";
  const isBeforeLock = league.locksAt !== null && league.locksAt > serverNow;

  res.json({
    leagueId,
    gameweek: league.currentGameweek,
    locksAt: league.locksAt,
    serverNow,
    teams: pool.map((team) => ({ ...team, used: usedThisCycle.has(team.name) })),
    currentPick: currentPick ?? null,
    canSubmit: membership.status === "alive" && isOpen && isBeforeLock,
    canEdit: membership.status === "alive" && isOpen && isBeforeLock && Boolean(currentPick),
  });
});

/**
 * Checks whether the user has an unconsumed Team Recall active for this
 * exact league + gameweek + team. Doesn't check the once-per-league cap
 * here — that's enforced at purchase time in shop.ts; this just checks
 * whether a previously-activated one applies to the pick being submitted.
 */
async function getActiveTeamRecall(
  database: PickDatabase,
  userId: string,
  leagueId: string,
  gameweek: number,
  team: string
) {
  const [recall] = await database
    .select()
    .from(activeBoosters)
    .where(
      and(
        eq(activeBoosters.userId, userId),
        eq(activeBoosters.leagueId, leagueId),
        eq(activeBoosters.gameweek, gameweek),
        eq(activeBoosters.boosterType, "team_recall"),
        eq(activeBoosters.team, team),
        isNull(activeBoosters.consumedAt)
      )
    );
  return recall ?? null;
}

// ---------------------------------------------------------------------------
// POST /api/picks — submit primary + optional backup pick for a gameweek
// ---------------------------------------------------------------------------

picksRouter.post("/", async (req, res) => {
  const parsed = submitPickSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }
  const input = parsed.data;
  const userId = req.userId as string;

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pick:${userId}:${input.leagueId}:${input.gameweek}`}))`);

      const [league] = await tx.select().from(leagues).where(eq(leagues.id, input.leagueId)).limit(1);
      if (!league) throw new PickSubmissionError(404, "League not found");
      if (league.currentGameweek !== input.gameweek) {
        throw new PickSubmissionError(409, `This league is currently on GW${league.currentGameweek}`);
      }

      const [membership] = await tx
        .select({ status: leagueMembers.status })
        .from(leagueMembers)
        .where(and(eq(leagueMembers.leagueId, input.leagueId), eq(leagueMembers.userId, userId)))
        .limit(1);
      if (!membership) throw new PickSubmissionError(403, "Not a member of this league");
      if (membership.status !== "alive") throw new PickSubmissionError(409, "You've been knocked out of this league");
      if (league.status !== "upcoming" && league.status !== "active") {
        throw new PickSubmissionError(409, "This league is not accepting picks");
      }

      const now = new Date();
      if (!league.locksAt) throw new PickSubmissionError(409, "The gameweek lock has not been scheduled");
      if (league.locksAt <= now) throw new PickSubmissionError(423, "The pick window is locked");

      const [existing] = await tx
        .select()
        .from(picks)
        .where(and(
          eq(picks.leagueId, input.leagueId),
          eq(picks.userId, userId),
          eq(picks.gameweek, input.gameweek)
        ))
        .limit(1);
      if (existing && samePickSelection(existing, input)) {
        return { pick: existing, replayed: true, updated: false };
      }

      const pool = await getLeagueTeamPool(tx, league);
      if (!pool.length) throw new PickSubmissionError(409, "Team data is not available for this league yet");
      const teamNames = new Set(pool.map((team) => team.name));
      if (!teamNames.has(input.primaryTeam)) {
        throw new PickSubmissionError(400, `${input.primaryTeam} is not available in this league`);
      }
      if (input.backupTeam && !teamNames.has(input.backupTeam)) {
        throw new PickSubmissionError(400, `${input.backupTeam} is not available in this league`);
      }
      if (input.backupTeam === input.primaryTeam) {
        throw new PickSubmissionError(400, "Backup pick must be different from primary pick");
      }

      const usedThisCycle = await getUsedTeamsThisCycle(
        tx,
        userId,
        input.leagueId,
        input.gameweek,
        pool.length
      );
      let recallId: string | null = null;
      if (usedThisCycle.has(input.primaryTeam)) {
        const recall = await getActiveTeamRecall(tx, userId, input.leagueId, input.gameweek, input.primaryTeam);
        if (!recall) throw new PickSubmissionError(409, `You've already used ${input.primaryTeam} this cycle`);
        recallId = recall.id;
      }
      if (input.backupTeam && usedThisCycle.has(input.backupTeam)) {
        throw new PickSubmissionError(409, `You've already used ${input.backupTeam} this cycle`);
      }

      const values = {
        primaryTeam: input.primaryTeam,
        backupTeam: input.backupTeam ?? null,
        result: "pending" as const,
        usedBackup: false,
        submittedAt: now,
      };
      const [savedPick] = existing
        ? await tx.update(picks).set(values).where(eq(picks.id, existing.id)).returning()
        : await tx.insert(picks).values({
            leagueId: input.leagueId,
            userId,
            gameweek: input.gameweek,
            ...values,
          }).returning();

      if (recallId) {
        await tx.update(activeBoosters).set({ consumedAt: now }).where(eq(activeBoosters.id, recallId));
      }

      return { pick: savedPick, replayed: false, updated: Boolean(existing) };
    });

    return res.status(result.updated || result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error instanceof PickSubmissionError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
});

// ---------------------------------------------------------------------------
// GET /api/picks/me?leagueId=... — powers the Picks tab (global or per-league)
// ---------------------------------------------------------------------------

picksRouter.get("/dashboard", async (req, res) => {
  const userId = req.userId as string;
  const serverNow = new Date();
  const memberships = await db
    .select({ league: leagues, memberStatus: leagueMembers.status })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .where(eq(leagueMembers.userId, userId))
    .orderBy(asc(leagues.locksAt));
  const userPicks = await db.select().from(picks).where(eq(picks.userId, userId));
  const pickByRound = new Map(userPicks.map((pick) => [`${pick.leagueId}:${pick.gameweek}`, pick]));

  const items = await Promise.all(memberships.map(async ({ league, memberStatus }) => {
    const currentPick = pickByRound.get(`${league.id}:${league.currentGameweek}`) ?? null;
    const selectedTeam = currentPick
      ? (currentPick.usedBackup ? currentPick.backupTeam : currentPick.primaryTeam)
      : null;
    const fixtures = league.competitionKey && league.seasonStartYear !== null
      ? await db.select().from(footballFixtures).where(and(
          eq(footballFixtures.competitionKey, league.competitionKey),
          eq(footballFixtures.seasonStartYear, league.seasonStartYear),
          eq(footballFixtures.matchday, league.currentGameweek)
        ))
      : [];
    const fixture = selectedTeam
      ? fixtures.find((row) => row.homeTeamName === selectedTeam || row.awayTeamName === selectedTeam) ?? null
      : null;
    const isOpen = league.status === "upcoming" || league.status === "active";
    const isBeforeLock = league.locksAt !== null && league.locksAt > serverNow;

    return {
      leagueId: league.id,
      leagueName: league.name,
      code: league.code,
      competitionKey: league.competitionKey,
      gameweek: league.currentGameweek,
      leagueStatus: league.status,
      memberStatus,
      locksAt: league.locksAt,
      canSubmit: memberStatus === "alive" && isOpen && isBeforeLock && currentPick === null,
      canEdit: memberStatus === "alive" && isOpen && isBeforeLock && currentPick !== null,
      pick: currentPick,
      fixture: fixture ? {
        providerId: fixture.providerId,
        utcDate: fixture.utcDate,
        status: fixture.status,
        homeTeamName: fixture.homeTeamName,
        awayTeamName: fixture.awayTeamName,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        winner: fixture.winner,
      } : null,
    };
  }));

  res.json({ serverNow, items });
});

picksRouter.get("/me", async (req, res) => {
  const userId = req.userId as string;
  const leagueId = req.query.leagueId as string | undefined;

  const rows = await db
    .select()
    .from(picks)
    .where(leagueId ? and(eq(picks.userId, userId), eq(picks.leagueId, leagueId)) : eq(picks.userId, userId))
    .orderBy(asc(picks.gameweek));

  res.json(rows);
});

// ---------------------------------------------------------------------------
// Elimination resolution — call this from your results engine/cron once
// match results are in. Not exposed as a public route; this is the shared
// logic your fixture-results job should invoke per pick.
// ---------------------------------------------------------------------------

/**
 * @param outcome "win" | "draw" | "loss" | "no_result" — the actual outcome
 *   for the team the user picked.
 *
 * IMPORTANT CORRECTION (25 Jul 2026): backup picks do NOT trigger on a loss
 * or an un-shielded draw. A previous version of this function got that
 * wrong — it fell through to checking the backup pick whenever the primary
 * didn't win, which is not the intended rule and would have let people
 * effectively get two live attempts every gameweek.
 *
 * The actual rule: backup exists ONLY to protect against the primary
 * team's match not being played at all — postponed, abandoned, whatever
 * reason. If the match was played and your team drew or lost, you're
 * eliminated (or saved by Draw Shield on a draw) — full stop, backup is
 * never consulted. Backup only comes into play when there's no real
 * result to judge the primary pick on.
 *
 * "no_result" is what your results engine should pass when a fixture is
 * postponed/abandoned/not played by the time results are processed.
 */
export async function resolvePick(pickId: string, outcome: "win" | "draw" | "loss" | "no_result") {
  const [pick] = await db.select().from(picks).where(eq(picks.id, pickId));
  if (!pick) throw new Error("Pick not found");

  if (outcome === "win") {
    await db.update(picks).set({ result: "survived" }).where(eq(picks.id, pickId));
    return;
  }

  if (outcome === "draw") {
    const [shield] = await db
      .select()
      .from(activeBoosters)
      .where(
        and(
          eq(activeBoosters.userId, pick.userId),
          eq(activeBoosters.leagueId, pick.leagueId),
          eq(activeBoosters.gameweek, pick.gameweek),
          eq(activeBoosters.boosterType, "draw_shield")
        )
      );

    if (shield) {
      await db.update(picks).set({ result: "survived" }).where(eq(picks.id, pickId));
      await db
        .update(activeBoosters)
        .set({ consumedAt: new Date() })
        .where(eq(activeBoosters.id, shield.id));
      return;
    }

    // No Draw Shield active — eliminated. Backup is NOT checked; the
    // match was played and produced a real (non-winning) result.
    await db.update(picks).set({ result: "eliminated" }).where(eq(picks.id, pickId));
    await db
      .update(leagueMembers)
      .set({ status: "knocked_out", knockedOutAtGameweek: pick.gameweek })
      .where(and(eq(leagueMembers.leagueId, pick.leagueId), eq(leagueMembers.userId, pick.userId)));
    return;
  }

  if (outcome === "loss") {
    // Match was played, team lost. Eliminated — backup is NOT checked.
    await db.update(picks).set({ result: "eliminated" }).where(eq(picks.id, pickId));
    await db
      .update(leagueMembers)
      .set({ status: "knocked_out", knockedOutAtGameweek: pick.gameweek })
      .where(and(eq(leagueMembers.leagueId, pick.leagueId), eq(leagueMembers.userId, pick.userId)));
    return;
  }

  // outcome === "no_result" — the ONLY case where backup is relevant.
  if (pick.backupTeam && !pick.usedBackup) {
    await db.update(picks).set({ usedBackup: true }).where(eq(picks.id, pickId));
    // NOTE: your results engine should now resolve THIS pick again once the
    // backup team's own match has a result, calling resolvePick with that
    // match's outcome ("win"/"draw"/"loss"/"no_result" again if even the
    // backup's match doesn't happen). This function only marks that backup
    // is now in play; the actual survived/eliminated call for the backup's
    // match belongs in the results engine, which has the fixture data this
    // module doesn't.
    return;
  }

  // No backup set (or backup already used) and the primary match still
  // didn't happen — this is a genuine edge case worth a real product
  // decision, not a default I should silently invent. Leaving the pick as
  // "pending" rather than guessing eliminated/survived; your results
  // engine should hold this gameweek open for the player until the
  // fixture is rescheduled and actually played.
}
