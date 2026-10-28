// artifacts/api-server/src/routes/friendsLeagues.ts
//
// Handles the Public Friends Leagues flow: browse -> view creator's
// self-written entry terms -> request to join -> creator approves/declines.
//
// IMPORTANT (product/legal note, keep this comment in the codebase):
// Knoxit never sets, collects, validates, or processes any money for
// Friends Leagues. `entryTerms` is opaque free text written by the league
// creator and displayed verbatim — it is never parsed, never used to
// calculate anything, and never referenced in any chip transaction. Do not
// add logic that reads this field programmatically; that would blur the
// "we just display what the creator wrote" position this feature relies on.

import { Router } from "express";
import { eq, and, count, sql } from "drizzle-orm";
import { db } from "@db/index";
import { leagues, leagueMembers, joinRequests, users } from "@db/schema";
import {
  requestToJoinSchema,
  resolveJoinRequestSchema,
  joinByCodeSchema,
} from "@api-zod/knoxit-schemas";
import { joinLeagueInternal } from "./leagues";
import { InsufficientChipsError } from "../lib/chipLedger";

export const friendsLeaguesRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/friends-leagues/join-by-code — instant join, no approval needed
// (25 Jul 2026 decision: a valid code is treated as proof of invitation
// already granted by the creator, so it skips the request/approve flow
// entirely — unlike public discovery, which always requires approval)
// ---------------------------------------------------------------------------

friendsLeaguesRouter.post("/join-by-code", async (req, res) => {
  const parsed = joinByCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const userId = req.userId as string;
  const { inviteCode } = parsed.data;

  const [league] = await db
    .select()
    .from(leagues)
    .where(and(eq(leagues.inviteCode, inviteCode.toUpperCase()), eq(leagues.type, "friends")));

  if (!league) {
    return res.status(404).json({ error: "No league found with that code. Double-check it and try again." });
  }

  const [existingMembership] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, userId)));
  if (existingMembership) {
    return res.status(400).json({ error: "You're already in this league" });
  }

  // Friends Leagues are always uncapped (maxMembers is null) per the
  // 25 Jul 2026 "anyone around can join" decision — no capacity check
  // needed here at all, since this route only ever joins friends leagues.

  try {
    await joinLeagueInternal(league.id, userId);
  } catch (err) {
    if (err instanceof InsufficientChipsError) {
      return res.status(400).json({ error: "Not enough chips to cover the entry fee" });
    }
    throw err;
  }

  res.status(200).json({ joined: true, leagueId: league.id, leagueName: league.name });
});

// ---------------------------------------------------------------------------
// GET /api/friends-leagues/public — browse screen
// ---------------------------------------------------------------------------

friendsLeaguesRouter.get("/public", async (req, res) => {
  const userId = req.userId as string;

  const publicFriendsLeagues = await db
    .select({
      id: leagues.id,
      name: leagues.name,
      entryTerms: leagues.entryTerms,
      creatorUsername: users.username,
      createdBy: leagues.createdBy,
    })
    .from(leagues)
    .innerJoin(users, eq(leagues.createdBy, users.id))
    .where(and(eq(leagues.type, "friends"), eq(leagues.visibility, "public")));

  const result = await Promise.all(
    publicFriendsLeagues.map(async (l) => {
      const [{ memberCount }] = await db
        .select({ memberCount: count() })
        .from(leagueMembers)
        .where(eq(leagueMembers.leagueId, l.id));

      const [membership] = await db
        .select()
        .from(leagueMembers)
        .where(and(eq(leagueMembers.leagueId, l.id), eq(leagueMembers.userId, userId)));

      const [pendingRequest] = await db
        .select()
        .from(joinRequests)
        .where(
          and(
            eq(joinRequests.leagueId, l.id),
            eq(joinRequests.requesterId, userId),
            eq(joinRequests.status, "pending")
          )
        );

      return {
        id: l.id,
        name: l.name,
        creatorUsername: l.creatorUsername,
        memberCount,
        entryTerms: l.entryTerms,
        alreadyJoined: Boolean(membership),
        hasPendingRequest: Boolean(pendingRequest),
      };
    })
  );

  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/friends-leagues/:id/request — "Request to Join"
// ---------------------------------------------------------------------------

friendsLeaguesRouter.post("/:id/request", async (req, res) => {
  const parsed = requestToJoinSchema.safeParse({ leagueId: req.params.id, message: req.body?.message });
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  const userId = req.userId as string;
  const { leagueId, message } = parsed.data;

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) return res.status(404).json({ error: "League not found" });
  if (league.type !== "friends") {
    return res.status(400).json({ error: "Use direct join for competitive leagues" });
  }

  const [existingMembership] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  if (existingMembership) return res.status(400).json({ error: "Already a member" });

  const [existingRequest] = await db
    .select()
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.leagueId, leagueId),
        eq(joinRequests.requesterId, userId),
        eq(joinRequests.status, "pending")
      )
    );
  if (existingRequest) return res.status(400).json({ error: "Request already pending" });

  const [request] = await db
    .insert(joinRequests)
    .values({ leagueId, requesterId: userId, status: "pending", message: message ?? null })
    .returning();

  res.status(201).json(request);
});

// ---------------------------------------------------------------------------
// GET /api/friends-leagues/requests/mine — requests awaiting the current
// user's approval, across every league they created OR were made an admin of
// ---------------------------------------------------------------------------

friendsLeaguesRouter.get("/requests/mine", async (req, res) => {
  const userId = req.userId as string;

  const rows = await db
    .select({
      requestId: joinRequests.id,
      requesterUsername: users.username,
      leagueName: leagues.name,
      leagueId: leagues.id,
      message: joinRequests.message,
    })
    .from(joinRequests)
    .innerJoin(leagues, eq(joinRequests.leagueId, leagues.id))
    .innerJoin(users, eq(joinRequests.requesterId, users.id))
    .leftJoin(
      leagueMembers,
      and(eq(leagueMembers.leagueId, leagues.id), eq(leagueMembers.userId, userId))
    )
    .where(
      and(
        eq(joinRequests.status, "pending"),
        sql`(${leagues.createdBy} = ${userId} or ${leagueMembers.isAdmin} = true)`
      )
    );

  res.json(rows);
});

// ---------------------------------------------------------------------------
// POST /api/friends-leagues/requests/:id/resolve — approve or decline
// (creator OR any promoted co-admin can do this)
// ---------------------------------------------------------------------------

friendsLeaguesRouter.post("/requests/:id/resolve", async (req, res) => {
  const parsed = resolveJoinRequestSchema.safeParse({
    requestId: req.params.id,
    decision: req.body?.decision,
  });
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }

  const userId = req.userId as string;
  const { requestId, decision } = parsed.data;

  const [request] = await db.select().from(joinRequests).where(eq(joinRequests.id, requestId));
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "pending") return res.status(400).json({ error: "Already resolved" });

  const [league] = await db.select().from(leagues).where(eq(leagues.id, request.leagueId));
  if (!league) return res.status(404).json({ error: "League not found" });

  const isCreator = league.createdBy === userId;
  const [membership] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, request.leagueId), eq(leagueMembers.userId, userId)));
  const isCoAdmin = membership?.isAdmin === true;

  if (!isCreator && !isCoAdmin) {
    return res.status(403).json({ error: "Only the league creator or a co-admin can resolve requests" });
  }

  if (decision === "approve") {
    await joinLeagueInternal(request.leagueId, request.requesterId);
  }

  await db
    .update(joinRequests)
    .set({ status: decision === "approve" ? "approved" : "declined", resolvedAt: new Date() })
    .where(eq(joinRequests.id, requestId));

  res.json({ resolved: decision });
});

// ---------------------------------------------------------------------------
// GET /api/friends-leagues/:id/members — member list with admin status,
// powers a "Manage Admins" screen
// ---------------------------------------------------------------------------

friendsLeaguesRouter.get("/:id/members", async (req, res) => {
  const leagueId = req.params.id;

  const rows = await db
    .select({
      userId: leagueMembers.userId,
      username: users.username,
      isAdmin: leagueMembers.isAdmin,
      status: leagueMembers.status,
      createdBy: leagues.createdBy,
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(eq(leagueMembers.leagueId, leagueId));

  res.json(rows.map(({ createdBy, ...row }) => ({ ...row, isCreator: row.userId === createdBy })));
});

// ---------------------------------------------------------------------------
// POST /api/friends-leagues/:id/members/:userId/set-admin — promote or
// demote a co-admin. ONLY the original creator can do this (deliberately
// not delegable — otherwise admin status could cascade uncontrollably).
// ---------------------------------------------------------------------------

friendsLeaguesRouter.post("/:id/members/:memberId/set-admin", async (req, res) => {
  const requesterId = req.userId as string;
  const leagueId = req.params.id;
  const memberId = req.params.memberId;
  const makeAdmin = Boolean(req.body?.isAdmin);

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  if (!league) return res.status(404).json({ error: "League not found" });
  if (league.createdBy !== requesterId) {
    return res.status(403).json({ error: "Only the league creator can promote or demote admins" });
  }
  if (memberId === league.createdBy) {
    return res.status(400).json({ error: "The creator's admin status can't be changed" });
  }

  const [membership] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, memberId)));
  if (!membership) return res.status(404).json({ error: "That user isn't a member of this league" });

  await db
    .update(leagueMembers)
    .set({ isAdmin: makeAdmin })
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, memberId)));

  res.json({ userId: memberId, isAdmin: makeAdmin });
});
