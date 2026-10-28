// Posts automatic league chat messages. Each carries a per-league key and the
// insert ignores duplicates, so callers (results engine, syncs, joins) can
// re-run without posting twice.

import { and, gt, inArray, lte } from "drizzle-orm";
import { db } from "@db/index";
import { leagueMessages, leagues } from "@db/schema";
import { lockReminderDue, systemMessages } from "./chatRules";

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
  league: { id: string; status: string; currentGameweek: number; locksAt: Date | null },
  now = new Date()
) {
  if (league.status !== "upcoming" && league.status !== "active") return;
  const minutesLeft = lockReminderDue(league.locksAt, now);
  if (minutesLeft === null) return;
  await postSystemMessage(database, league.id, systemMessages.lockReminder(league.currentGameweek, minutesLeft));
}

/** "Picks lock in 1 hour" for every open league locking within the hour. */
export async function postDueLockReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 60 * 60 * 1000);
  const due = await db
    .select({ id: leagues.id, status: leagues.status, currentGameweek: leagues.currentGameweek, locksAt: leagues.locksAt })
    .from(leagues)
    .where(and(inArray(leagues.status, ["upcoming", "active"]), gt(leagues.locksAt, now), lte(leagues.locksAt, soon)));
  for (const league of due) await postLockReminder(db, league, now);
  return due.length;
}
