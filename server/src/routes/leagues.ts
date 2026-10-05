// artifacts/api-server/src/routes/leagues.ts
//
// The session middleware validates the Neon-backed session cookie and
// attaches `req.userId` before this router runs.

import { Router } from "express";
import { eq, and, asc, count, max, sql } from "drizzle-orm";
import { db } from "@db/index";
import { footballCompetitions, footballFixtures, leagues, leagueMembers, picks } from "@db/schema";
import {
  createLeagueSchema,
  joinCompetitionSchema,
  joinLeagueSchema,
} from "@api-zod/knoxit-schemas";
import {
  applyChipTransaction,
  applyChipTransactionInTransaction,
  InsufficientChipsError,
} from "../lib/chipLedger";

export const leaguesRouter = Router();
const ROUND_LOCK_BUFFER_MS = 60 * 60 * 1000;

function firstOpenRound(fixtures: Array<{ matchday: number | null; utcDate: Date }>, now = new Date()) {
  const firstKickoffByRound = new Map<number, Date>();
  for (const fixture of fixtures) {
    if (fixture.matchday === null) continue;
    const current = firstKickoffByRound.get(fixture.matchday);
    if (!current || fixture.utcDate < current) firstKickoffByRound.set(fixture.matchday, fixture.utcDate);
  }

  return [...firstKickoffByRound.entries()]
    .map(([startingRound, firstKickoff]) => ({
      startingRound,
      firstKickoff,
      locksAt: new Date(firstKickoff.getTime() - ROUND_LOCK_BUFFER_MS),
    }))
    .filter((round) => round.locksAt > now)
    .sort((left, right) => left.firstKickoff.getTime() - right.firstKickoff.getTime())[0] ?? null;
}

async function getRoundTiming(competitionKey: string, seasonStartYear: number, startingRound: number) {
  const fixtures = await db
    .select({ utcDate: footballFixtures.utcDate })
    .from(footballFixtures)
    .where(and(
      eq(footballFixtures.competitionKey, competitionKey),
      eq(footballFixtures.seasonStartYear, seasonStartYear),
      eq(footballFixtures.matchday, startingRound)
    ))
    .orderBy(asc(footballFixtures.utcDate));

  const firstKickoff = fixtures[0]?.utcDate;
  return firstKickoff
    ? { firstKickoff, locksAt: new Date(firstKickoff.getTime() - ROUND_LOCK_BUFFER_MS) }
    : null;
}

// ---------------------------------------------------------------------------
// GET /api/leagues/competitions — one Explore card per real competition.
// Internal 20-player cohort instances intentionally stay hidden here.
// ---------------------------------------------------------------------------

leaguesRouter.get("/competitions", async (_req, res) => {
  const competitions = await db
    .select()
    .from(footballCompetitions)
    .where(eq(footballCompetitions.competitiveEnabled, true))
    .orderBy(asc(footballCompetitions.name));

  const cards = await Promise.all(competitions.map(async (competition) => {
    if (competition.seasonStartYear === null) {
      return {
        competitionKey: competition.key,
        name: competition.name,
        emblem: competition.emblem,
        seasonStartYear: null,
        startingRound: null,
        locksAt: null,
        entryFeeChips: competition.competitiveEntryFeeChips,
        maxMembersPerCohort: competition.competitiveMaxMembers,
        joinedEntries: 0,
        available: false,
        unavailableReason: "Season data has not been synced yet",
      };
    }

    const fixtureRows = await db
      .select({ matchday: footballFixtures.matchday, utcDate: footballFixtures.utcDate })
      .from(footballFixtures)
      .where(and(
        eq(footballFixtures.competitionKey, competition.key),
        eq(footballFixtures.seasonStartYear, competition.seasonStartYear)
      ));
    const round = firstOpenRound(fixtureRows);

    if (!round) {
      return {
        competitionKey: competition.key,
        name: competition.name,
        emblem: competition.emblem,
        seasonStartYear: competition.seasonStartYear,
        startingRound: null,
        locksAt: null,
        entryFeeChips: competition.competitiveEntryFeeChips,
        maxMembersPerCohort: competition.competitiveMaxMembers,
        joinedEntries: 0,
        available: false,
        unavailableReason: "No future round is open for entry",
      };
    }

    const [{ joinedEntries }] = await db
      .select({ joinedEntries: count(leagueMembers.userId) })
      .from(leagues)
      .leftJoin(leagueMembers, eq(leagueMembers.leagueId, leagues.id))
      .where(and(
        eq(leagues.type, "competitive"),
        eq(leagues.competitionKey, competition.key),
        eq(leagues.seasonStartYear, competition.seasonStartYear),
        eq(leagues.startingRound, round.startingRound)
      ));

    return {
      competitionKey: competition.key,
      name: competition.name,
      emblem: competition.emblem,
      seasonStartYear: competition.seasonStartYear,
      startingRound: round.startingRound,
      locksAt: round.locksAt,
      entryFeeChips: competition.competitiveEntryFeeChips,
      maxMembersPerCohort: competition.competitiveMaxMembers,
      joinedEntries,
      available: true,
      unavailableReason: null,
    };
  }));

  res.json(cards);
});

// ---------------------------------------------------------------------------
// POST /api/leagues/join-competition — atomically find or create a 20-player
// cohort, charge its entry fee, grow its vault and add the membership.
// ---------------------------------------------------------------------------

leaguesRouter.post("/join-competition", async (req, res, next) => {
  const parsed = joinCompetitionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid competition join", details: parsed.error.flatten() });
  }

  const userId = req.userId as string;
  const { competitionKey, startingRound, idempotencyKey } = parsed.data;

  try {
    // A completed request remains replayable even if its round has since
    // locked or the provider has rolled over to a new season.
    const [previousJoin] = await db
      .select({ league: leagues })
      .from(leagueMembers)
      .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
      .where(and(
        eq(leagueMembers.userId, userId),
        eq(leagueMembers.joinRequestKey, idempotencyKey)
      ));
    if (previousJoin) {
      return res.json({
        joined: true,
        replayed: true,
        league: {
          id: previousJoin.league.id,
          code: previousJoin.league.code,
          name: previousJoin.league.name,
          competitionKey: previousJoin.league.competitionKey,
          seasonStartYear: previousJoin.league.seasonStartYear,
          startingRound: previousJoin.league.startingRound,
          instanceNumber: previousJoin.league.instanceNumber,
          locksAt: previousJoin.league.locksAt,
        },
      });
    }

    const [competition] = await db
      .select()
      .from(footballCompetitions)
      .where(eq(footballCompetitions.key, competitionKey));
    if (!competition || !competition.competitiveEnabled) {
      return res.status(404).json({ error: "Competition is not available" });
    }
    if (competition.seasonStartYear === null) {
      return res.status(409).json({ error: "Competition season data has not been synced yet" });
    }

    const timing = await getRoundTiming(competitionKey, competition.seasonStartYear, startingRound);
    if (!timing) return res.status(409).json({ error: "Fixtures for this round have not been synced" });
    if (timing.locksAt <= new Date()) return res.status(409).json({ error: "Entry for this round is locked" });

    const result = await db.transaction(async (tx) => {
      // Serialize retries first, then allocation for this competition round.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`join:${userId}:${idempotencyKey}`}))`);

      const [replayed] = await tx
        .select({ league: leagues })
        .from(leagueMembers)
        .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
        .where(and(
          eq(leagueMembers.userId, userId),
          eq(leagueMembers.joinRequestKey, idempotencyKey)
        ));
      if (replayed) return { league: replayed.league, replayed: true };

      const allocationKey = `cohort:${competitionKey}:${competition.seasonStartYear}:${startingRound}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${allocationKey}))`);
      if (timing.locksAt <= new Date()) throw new Error("ROUND_LOCKED");

      await tx
        .update(leagues)
        .set({ locksAt: timing.locksAt })
        .where(and(
          eq(leagues.type, "competitive"),
          eq(leagues.status, "upcoming"),
          eq(leagues.competitionKey, competitionKey),
          eq(leagues.seasonStartYear, competition.seasonStartYear),
          eq(leagues.startingRound, startingRound)
        ));

      const candidates = await tx
        .select()
        .from(leagues)
        .where(and(
          eq(leagues.type, "competitive"),
          eq(leagues.status, "upcoming"),
          eq(leagues.competitionKey, competitionKey),
          eq(leagues.seasonStartYear, competition.seasonStartYear),
          eq(leagues.startingRound, startingRound)
        ))
        .orderBy(asc(leagues.instanceNumber));

      const userMemberships = new Set((await tx
        .select({ leagueId: leagueMembers.leagueId })
        .from(leagueMembers)
        .where(eq(leagueMembers.userId, userId))).map((row) => row.leagueId));

      let league = null as typeof candidates[number] | null;
      for (const candidate of candidates) {
        if (userMemberships.has(candidate.id)) continue;
        const [{ memberCount }] = await tx
          .select({ memberCount: count() })
          .from(leagueMembers)
          .where(eq(leagueMembers.leagueId, candidate.id));
        if (candidate.maxMembers === null || memberCount < candidate.maxMembers) {
          league = candidate;
          break;
        }
      }

      if (!league) {
        const [{ highestInstance }] = await tx
          .select({ highestInstance: max(leagues.instanceNumber) })
          .from(leagues)
          .where(and(
            eq(leagues.type, "competitive"),
            eq(leagues.competitionKey, competitionKey),
            eq(leagues.seasonStartYear, competition.seasonStartYear),
            eq(leagues.startingRound, startingRound)
          ));
        const instanceNumber = (highestInstance ?? 0) + 1;
        const seasonCode = String(competition.seasonStartYear).slice(-2);
        const code = `${competition.providerCode}-${seasonCode}-R${startingRound}-${instanceNumber}`;
        [league] = await tx
          .insert(leagues)
          .values({
            code,
            name: `${competition.name} Survivor`,
            sport: competitionKey,
            type: "competitive",
            visibility: "public",
            status: "upcoming",
            competitionKey,
            seasonStartYear: competition.seasonStartYear,
            startingRound,
            instanceNumber,
            entryFeeChips: competition.competitiveEntryFeeChips,
            maxMembers: competition.competitiveMaxMembers,
            currentGameweek: startingRound,
            locksAt: timing.locksAt,
          })
          .returning();
      }

      let balanceAfter: number | undefined;
      if (league.entryFeeChips > 0) {
        const chipResult = await applyChipTransactionInTransaction(tx, {
          userId,
          leagueId: league.id,
          type: "league_entry",
          amount: -league.entryFeeChips,
          vaultAmount: league.entryFeeChips,
          note: `Entry fee for ${league.name} (${league.code})`,
        });
        balanceAfter = chipResult.balanceAfter;
      }

      await tx.insert(leagueMembers).values({
        leagueId: league.id,
        userId,
        status: "alive",
        joinRequestKey: idempotencyKey,
      });
      await tx
        .update(leagues)
        .set({ vaultChips: sql`${leagues.vaultChips} + ${league.entryFeeChips}` })
        .where(eq(leagues.id, league.id));

      return { league, replayed: false, balanceAfter };
    });

    return res.status(result.replayed ? 200 : 201).json({
      joined: true,
      replayed: result.replayed,
      balanceAfter: result.balanceAfter,
      league: {
        id: result.league.id,
        code: result.league.code,
        name: result.league.name,
        competitionKey: result.league.competitionKey,
        seasonStartYear: result.league.seasonStartYear,
        startingRound: result.league.startingRound,
        instanceNumber: result.league.instanceNumber,
        locksAt: result.league.locksAt,
      },
    });
  } catch (error) {
    if (error instanceof InsufficientChipsError) {
      return res.status(400).json({
        error: `You need ${error.required.toLocaleString()} chips. Your balance is ${error.available.toLocaleString()} chips.`,
        code: "INSUFFICIENT_CHIPS",
        required: error.required,
        available: error.available,
        shortfall: error.shortfall,
      });
    }
    if (error instanceof Error && error.message === "ROUND_LOCKED") {
      return res.status(409).json({ error: "Entry for this round is locked" });
    }
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/leagues — create a Friends League. Competitive cohorts are
// created only when a player joins a real football competition.
// ---------------------------------------------------------------------------

leaguesRouter.post("/", async (req, res) => {
  const parsed = createLeagueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }
  const input = parsed.data;
  const userId = req.userId as string;

  if (input.type === "competitive") {
    return res.status(400).json({
      error: "Competitive leagues are allocated automatically. Use POST /api/leagues/join-competition.",
    });
  }

  // Friends Leagues have neither an entry fee nor a member cap. Force these
  // values server-side instead of trusting consequential client input.
  const entryFeeChips = 0;
  const maxMembers = null;

  const [nameClash] = await db
    .select({ id: leagues.id })
    .from(leagues)
    .where(and(eq(leagues.type, "friends"), sql`lower(${leagues.name}) = lower(${input.name})`));
  if (nameClash) {
    return res.status(409).json({ error: "A friends league with this name already exists. Try a different name." });
  }

  const code = await generateLeagueCode(input.sport, input.type);
  const inviteCode = await generateUniqueInviteCode();

  const [league] = await db
    .insert(leagues)
    .values({
      code,
      inviteCode,
      name: input.name,
      sport: input.sport,
      type: input.type,
      visibility: input.visibility,
      status: "upcoming",
      createdBy: userId,
      entryFeeChips,
      vaultChips: 0,
      maxMembers,
      entryTerms: input.entryTerms ?? null,
      locksAt: input.locksAt ? new Date(input.locksAt) : null,
    })
    .returning();

  // Creator auto-joins their own league and is always an admin.
  await joinLeagueInternal(league.id, userId, { isAdmin: true });

  res.status(201).json({
    id: league.id,
    code: league.code,
    name: league.name,
    inviteCode: league.inviteCode,
  });
});

/**
 * Generates a random, non-guessable invite code for Friends Leagues
 * (distinct from the sequential display `code` like "WW-1" — that one's
 * predictable on purpose for readability; this one must NOT be, since
 * knowing it grants instant join with no approval step). Retries on the
 * astronomically unlikely event of a collision.
 */
async function generateUniqueInviteCode(): Promise<string> {
  // Excludes ambiguous characters (0/O, 1/I/L) so codes are easy to read
  // and type out loud or share via text without confusion.
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const CODE_LENGTH = 6;

  for (let attempt = 0; attempt < 5; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    const [existing] = await db.select({ id: leagues.id }).from(leagues).where(eq(leagues.inviteCode, code));
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique invite code after 5 attempts — extremely unlikely, check ALPHABET/CODE_LENGTH sizing");
}

async function generateLeagueCode(sport: string, type: string): Promise<string> {
  const prefix = type === "friends" ? "FR" : sport.slice(0, 2).toUpperCase();
  const [{ value }] = await db.execute(
    sql`select count(*) + 1 as value from ${leagues} where sport = ${sport}`
  );
  return `${prefix}-${value}`;
}

// ---------------------------------------------------------------------------
// POST /api/leagues/:id/join — retained as a clear error for older clients.
// Competitive joins allocate by competition; Friends joins use requests or
// invite codes. Neither flow may bypass those rules with an internal ID.
// ---------------------------------------------------------------------------

leaguesRouter.post("/:id/join", async (req, res) => {
  const parsed = joinLeagueSchema.safeParse({ leagueId: req.params.id });
  if (!parsed.success) return res.status(400).json({ error: "Invalid league id" });

  const leagueId = parsed.data.leagueId;

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) return res.status(404).json({ error: "League not found" });

  if (league.type === "competitive") {
    return res.status(409).json({
      error: "Join this competition through POST /api/leagues/join-competition so Knoxit can allocate a cohort.",
    });
  }
  return res.status(403).json({
    error: "Friends Leagues require an invite code or an approved join request.",
  });
});

/**
 * Shared join logic: deducts the entry fee (if any), adds it to the vault,
 * and creates the membership row. Used by both direct public joins and
 * approved Friends League join requests.
 */
export async function joinLeagueInternal(
  leagueId: string,
  userId: string,
  opts: { isAdmin?: boolean } = {}
) {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) throw new Error("League not found");

  if (league.entryFeeChips > 0) {
    await applyChipTransaction({
      userId,
      leagueId,
      type: "league_entry",
      amount: -league.entryFeeChips,
      vaultAmount: league.entryFeeChips,
      note: `Entry fee for ${league.name}`,
    });
  }

  await db.insert(leagueMembers).values({
    leagueId,
    userId,
    status: "alive",
    isAdmin: opts.isAdmin ?? false,
  });

  // Vault grows per joiner (decided 22 Jul 2026) — fixed once the league locks.
  if (league.status === "upcoming") {
    await db
      .update(leagues)
      .set({ vaultChips: league.vaultChips + league.entryFeeChips })
      .where(eq(leagues.id, leagueId));
  }
}

// ---------------------------------------------------------------------------
// GET /api/leagues/:id — League Detail / Command Center data
// ---------------------------------------------------------------------------

leaguesRouter.get("/mine", async (req, res) => {
  const userId = req.userId as string;

  const rows = await db
    .select({
      league: leagues,
      memberStatus: leagueMembers.status,
    })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(eq(leagueMembers.userId, userId));

  res.json(
    rows.map((r) => ({
      ...r.league,
      memberStatus: r.memberStatus, // "alive" | "knocked_out" — frontend buckets into tabs from this
    }))
  );
});

// ---------------------------------------------------------------------------

leaguesRouter.get("/:id", async (req, res) => {
  const leagueId = req.params.id;
  const userId = req.userId as string;

  const parsed = joinLeagueSchema.safeParse({ leagueId });
  if (!parsed.success) return res.status(400).json({ error: "Invalid league id" });

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) return res.status(404).json({ error: "League not found" });

  const [membership] = await db
    .select({ status: leagueMembers.status, isAdmin: leagueMembers.isAdmin })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
    .limit(1);
  if (!membership) return res.status(403).json({ error: "You are not a member of this league" });

  const [[{ aliveCount }], [{ joinedCount }], [currentPick]] = await Promise.all([
    db
      .select({ aliveCount: count() })
      .from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.status, "alive"))),
    db
      .select({ joinedCount: count() })
      .from(leagueMembers)
      .where(eq(leagueMembers.leagueId, leagueId)),
    db
      .select({
        id: picks.id,
        primaryTeam: picks.primaryTeam,
        backupTeam: picks.backupTeam,
        result: picks.result,
        submittedAt: picks.submittedAt,
      })
      .from(picks)
      .where(and(
        eq(picks.leagueId, leagueId),
        eq(picks.userId, userId),
        eq(picks.gameweek, league.currentGameweek)
      ))
      .limit(1),
  ]);

  const now = new Date();
  const isLeagueOpen = league.status === "upcoming" || league.status === "active";
  const isBeforeLock = league.locksAt !== null && league.locksAt > now;
  const canTakeAction = membership.status === "alive" && isLeagueOpen && isBeforeLock && !currentPick;
  const canEditPick = membership.status === "alive" && isLeagueOpen && isBeforeLock && Boolean(currentPick);

  res.json({
    id: league.id,
    code: league.code,
    name: league.name,
    type: league.type,
    status: league.status,
    currentGameweek: league.currentGameweek,
    locksAt: league.locksAt,
    vaultChips: league.vaultChips,
    aliveCount,
    joinedCount,
    maxMembers: league.maxMembers,
    memberStatus: membership.status,
    currentPick: currentPick ?? null,
    canTakeAction,
    canEditPick,
    canManageSettings: league.type === "friends" && (league.createdBy === userId || membership.isAdmin),
    serverNow: now,
  });
});

// ---------------------------------------------------------------------------
// GET /api/leagues/mine — powers My Leagues (Active/Friends/Knocked Out tabs)
