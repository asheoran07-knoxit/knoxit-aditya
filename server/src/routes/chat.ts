// artifacts/api-server/src/routes/chat.ts
//
// League group chat. Only league members (alive or knocked out) can read or
// post. Live updates are by polling: clients ask for ?after=<cursor> and get
// every message created or changed (reaction, deletion) since then.

import { Router } from "express";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@db/index";
import {
  leagueChatReads,
  leagueMembers,
  leagueMessages,
  leagues,
  messageReactions,
  messageReports,
  userMutes,
  users,
} from "@db/schema";
import { sendMessageSchema } from "@api-zod/knoxit-schemas";
import {
  canModerateChat,
  CHAT_PAGE_SIZE,
  CHAT_RATE_LIMIT,
  isRateLimited,
  isReactionEmoji,
  normalizeMessageContent,
} from "../lib/chatRules";
import { postLockReminder, postPredictorReveals } from "../lib/systemMessages";

export const chatRouter = Router();

const uuid = z.string().uuid();
// Overlap each poll window so a message committed while a poll was running
// is still picked up next time; clients de-duplicate by id.
const POLL_OVERLAP_MS = 2_000;

async function loadMembership(leagueId: string, userId: string) {
  if (!uuid.safeParse(leagueId).success) return null;
  const [row] = await db
    .select({ league: leagues, isAdmin: leagueMembers.isAdmin, status: leagueMembers.status, joinedAt: leagueMembers.joinedAt })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  return row ?? null;
}

async function mutedUserIds(userId: string) {
  const rows = await db.select({ mutedUserId: userMutes.mutedUserId }).from(userMutes).where(eq(userMutes.userId, userId));
  return rows.map((row) => row.mutedUserId);
}

function parseTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Shapes messages for one viewer: author names/status and reaction tallies. */
async function presentMessages(leagueId: string, viewerId: string, rows: Array<typeof leagueMessages.$inferSelect>) {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const authorIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => id !== null))];

  const [authors, reactions] = await Promise.all([
    authorIds.length
      ? db
          .select({ userId: users.id, username: users.username, status: leagueMembers.status })
          .from(users)
          .leftJoin(leagueMembers, and(eq(leagueMembers.userId, users.id), eq(leagueMembers.leagueId, leagueId)))
          .where(inArray(users.id, authorIds))
      : Promise.resolve([]),
    db.select().from(messageReactions).where(inArray(messageReactions.messageId, ids)),
  ]);
  const authorById = new Map(authors.map((author) => [author.userId, author]));

  return rows.map((row) => {
    const author = row.userId ? authorById.get(row.userId) : undefined;
    const tally = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const reaction of reactions) {
      if (reaction.messageId !== row.id) continue;
      const entry = tally.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, mine: false };
      entry.count += 1;
      entry.mine ||= reaction.userId === viewerId;
      tally.set(reaction.emoji, entry);
    }
    const deleted = row.deletedAt !== null;
    return {
      id: row.id,
      kind: row.kind as "user" | "system",
      userId: row.userId,
      username: author?.username ?? null,
      authorStatus: author?.status ?? null,
      content: deleted ? "" : row.content,
      deleted,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      reactions: deleted ? [] : [...tally.values()],
    };
  });
}

// ---------------------------------------------------------------------------
// GET /api/leagues/:id/messages
//   (no params)        latest CHAT_PAGE_SIZE messages
//   ?before=<iso>      the page before that time ("Load earlier messages")
//   ?after=<cursor>    everything created or changed since the cursor (polling)
// ---------------------------------------------------------------------------

chatRouter.get("/:id/messages", async (req, res) => {
  const userId = req.userId as string;
  const leagueId = req.params.id;
  const membership = await loadMembership(leagueId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this league" });

  const startedAt = new Date();
  // While anyone has the chat open, make sure automatic messages are up to
  // date: Survivor's final-hour reminder, Predictor's per-match reveals.
  if (membership.league.gameType === "predictor") await postPredictorReveals(db, membership.league, startedAt);
  else await postLockReminder(db, membership.league, startedAt);

  const muted = await mutedUserIds(userId);
  const notMuted = muted.length
    ? or(isNull(leagueMessages.userId), notInArray(leagueMessages.userId, muted))
    : undefined;
  const after = parseTimestamp(req.query.after);
  const before = parseTimestamp(req.query.before);

  let rows: Array<typeof leagueMessages.$inferSelect>;
  let hasMore = false;
  if (after) {
    rows = await db
      .select()
      .from(leagueMessages)
      .where(and(eq(leagueMessages.leagueId, leagueId), gt(leagueMessages.updatedAt, after), notMuted))
      .orderBy(asc(leagueMessages.updatedAt))
      .limit(200);
  } else {
    const page = await db
      .select()
      .from(leagueMessages)
      .where(and(eq(leagueMessages.leagueId, leagueId), before ? lt(leagueMessages.createdAt, before) : undefined, notMuted))
      .orderBy(desc(leagueMessages.createdAt))
      .limit(CHAT_PAGE_SIZE + 1);
    hasMore = page.length > CHAT_PAGE_SIZE;
    rows = page.slice(0, CHAT_PAGE_SIZE).reverse();
  }

  res.json({
    messages: await presentMessages(leagueId, userId, rows),
    hasMore,
    cursor: new Date(startedAt.getTime() - POLL_OVERLAP_MS),
    mutedUserIds: muted,
    canModerate: canModerateChat({
      leagueType: membership.league.type,
      isCreator: membership.league.createdBy === userId,
      isAdmin: membership.isAdmin,
    }),
  });
});

// ---------------------------------------------------------------------------
// POST /api/leagues/:id/messages — send. Max 500 characters, 5 messages per
// 10 seconds per user, basic bad-word masking. Knocked-out members can post.
// ---------------------------------------------------------------------------

chatRouter.post("/:id/messages", async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  const userId = req.userId as string;
  const leagueId = req.params.id;
  const membership = await loadMembership(leagueId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this league" });
  if (!parsed.success) {
    return res.status(400).json({ error: "Messages must be 1–500 characters", details: parsed.error.flatten() });
  }

  const normalized = normalizeMessageContent(parsed.data.content);
  if (!normalized.ok) return res.status(400).json({ error: normalized.error });

  const now = new Date();
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(leagueMessages)
    .where(and(
      eq(leagueMessages.userId, userId),
      eq(leagueMessages.kind, "user"),
      gt(leagueMessages.createdAt, new Date(now.getTime() - CHAT_RATE_LIMIT.windowMs))
    ));
  if (isRateLimited(recent)) {
    return res.status(429).json({ error: "You're sending messages too fast. Wait a few seconds.", code: "RATE_LIMITED" });
  }

  const [message] = await db
    .insert(leagueMessages)
    .values({ leagueId, userId, kind: "user", content: normalized.content, createdAt: now, updatedAt: now })
    .returning();

  const [presented] = await presentMessages(leagueId, userId, [message]);
  res.status(201).json(presented);
});

async function loadLeagueMessage(leagueId: string, messageId: string) {
  if (!uuid.safeParse(messageId).success) return null;
  const [message] = await db
    .select()
    .from(leagueMessages)
    .where(and(eq(leagueMessages.id, messageId), eq(leagueMessages.leagueId, leagueId)));
  return message ?? null;
}

// ---------------------------------------------------------------------------
// POST /api/leagues/:id/messages/:messageId/reactions { emoji } — toggle one
// of 😂 🔥 😭 👏 (one of each per user per message).
// ---------------------------------------------------------------------------

chatRouter.post("/:id/messages/:messageId/reactions", async (req, res) => {
  const userId = req.userId as string;
  const { id: leagueId, messageId } = req.params;
  const membership = await loadMembership(leagueId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this league" });
  const emoji = req.body?.emoji;
  if (!isReactionEmoji(emoji)) return res.status(400).json({ error: "Unsupported reaction" });

  const message = await loadLeagueMessage(leagueId, messageId);
  if (!message || message.deletedAt) return res.status(404).json({ error: "Message not found" });

  const removed = await db
    .delete(messageReactions)
    .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId), eq(messageReactions.emoji, emoji)))
    .returning();
  if (removed.length === 0) {
    await db.insert(messageReactions).values({ messageId, userId, emoji }).onConflictDoNothing();
  }
  await db.update(leagueMessages).set({ updatedAt: new Date() }).where(eq(leagueMessages.id, messageId));

  res.json({ reacted: removed.length === 0, emoji });
});

// ---------------------------------------------------------------------------
// POST /api/leagues/:id/messages/:messageId/report { reason? } — stored for
// operations review (GET /api/operations/chat-reports).
// ---------------------------------------------------------------------------

chatRouter.post("/:id/messages/:messageId/report", async (req, res) => {
  const userId = req.userId as string;
  const { id: leagueId, messageId } = req.params;
  const membership = await loadMembership(leagueId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this league" });

  const message = await loadLeagueMessage(leagueId, messageId);
  if (!message || message.kind !== "user") return res.status(404).json({ error: "Message not found" });
  if (message.userId === userId) return res.status(400).json({ error: "You can't report your own message" });

  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 300) || null : null;
  await db.insert(messageReports).values({ messageId, reporterId: userId, reason }).onConflictDoNothing();
  res.status(201).json({ reported: true });
});

// ---------------------------------------------------------------------------
// DELETE /api/leagues/:id/messages/:messageId — Friends League creator or
// co-admin removes any message. The text is kept for operations review.
// ---------------------------------------------------------------------------

chatRouter.delete("/:id/messages/:messageId", async (req, res) => {
  const userId = req.userId as string;
  const { id: leagueId, messageId } = req.params;
  const membership = await loadMembership(leagueId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this league" });
  const allowed = canModerateChat({
    leagueType: membership.league.type,
    isCreator: membership.league.createdBy === userId,
    isAdmin: membership.isAdmin,
  });
  if (!allowed) return res.status(403).json({ error: "Only the league creator or an admin can delete messages" });

  const message = await loadLeagueMessage(leagueId, messageId);
  if (!message) return res.status(404).json({ error: "Message not found" });
  if (!message.deletedAt) {
    const now = new Date();
    await db
      .update(leagueMessages)
      .set({ deletedAt: now, deletedBy: userId, updatedAt: now })
      .where(eq(leagueMessages.id, messageId));
  }
  res.json({ deleted: true });
});

// ---------------------------------------------------------------------------
// POST /api/leagues/:id/chat/mutes/:userId { muted } — hide (or unhide) a
// player's messages for the current user only, in every league.
// ---------------------------------------------------------------------------

chatRouter.post("/:id/chat/mutes/:mutedUserId", async (req, res) => {
  const userId = req.userId as string;
  const { id: leagueId, mutedUserId } = req.params;
  const membership = await loadMembership(leagueId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this league" });
  if (!uuid.safeParse(mutedUserId).success) return res.status(400).json({ error: "Invalid user" });
  if (mutedUserId === userId) return res.status(400).json({ error: "You can't mute yourself" });

  const muted = req.body?.muted !== false;
  if (muted) {
    await db.insert(userMutes).values({ userId, mutedUserId }).onConflictDoNothing();
  } else {
    await db.delete(userMutes).where(and(eq(userMutes.userId, userId), eq(userMutes.mutedUserId, mutedUserId)));
  }
  res.json({ mutedUserId, muted });
});

// ---------------------------------------------------------------------------
// Unread badge: GET /:id/chat/unread counts messages from others since the
// user last had the chat open; POST /:id/chat/read records that moment.
// ---------------------------------------------------------------------------

chatRouter.get("/:id/chat/unread", async (req, res) => {
  const userId = req.userId as string;
  const leagueId = req.params.id;
  const membership = await loadMembership(leagueId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this league" });

  const [read] = await db
    .select({ lastReadAt: leagueChatReads.lastReadAt })
    .from(leagueChatReads)
    .where(and(eq(leagueChatReads.leagueId, leagueId), eq(leagueChatReads.userId, userId)));
  const muted = await mutedUserIds(userId);

  const [{ unread }] = await db
    .select({ unread: count() })
    .from(leagueMessages)
    .where(and(
      eq(leagueMessages.leagueId, leagueId),
      isNull(leagueMessages.deletedAt),
      or(isNull(leagueMessages.userId), ne(leagueMessages.userId, userId)),
      // Never opened the chat: only what was said since joining counts as unread.
      gt(leagueMessages.createdAt, read?.lastReadAt ?? membership.joinedAt),
      muted.length ? or(isNull(leagueMessages.userId), notInArray(leagueMessages.userId, muted)) : undefined
    ));
  res.json({ unread: Math.min(unread, 99) });
});

chatRouter.post("/:id/chat/read", async (req, res) => {
  const userId = req.userId as string;
  const leagueId = req.params.id;
  const membership = await loadMembership(leagueId, userId);
  if (!membership) return res.status(403).json({ error: "Not a member of this league" });

  const now = new Date();
  await db
    .insert(leagueChatReads)
    .values({ leagueId, userId, lastReadAt: now })
    .onConflictDoUpdate({ target: [leagueChatReads.leagueId, leagueChatReads.userId], set: { lastReadAt: sql`excluded.last_read_at` } });
  res.json({ lastReadAt: now });
});
