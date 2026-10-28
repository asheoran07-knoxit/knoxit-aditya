// League chat rules, enforced on the server. Content is stored and returned
// as plain text; clients must render it as text (never as HTML), which is
// what makes "<script>" show up literally instead of running.

export const CHAT_MAX_LENGTH = 500;
export const CHAT_PAGE_SIZE = 50;
export const CHAT_RATE_LIMIT = { messages: 5, windowMs: 10_000 };
export const REACTION_EMOJIS = ["😂", "🔥", "😭", "👏"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === "string" && (REACTION_EMOJIS as readonly string[]).includes(value);
}

// Word stems masked wherever they start a word ("fucking" -> "***").
// Deliberately basic; it catches the common cases without trying to be clever.
const BLOCKED_STEMS = [
  "fuck", "motherfuck", "shit", "bitch", "cunt", "bastard", "slut", "whore",
  "wanker", "twat", "bollock", "asshole", "arsehole", "dickhead", "prick",
];
const BLOCKED_PATTERN = new RegExp(`\\b(?:${BLOCKED_STEMS.join("|")})\\w*`, "gi");

export function maskProfanity(text: string) {
  return text.replace(BLOCKED_PATTERN, "***");
}

/** Trims, drops control characters (keeping line breaks) and caps blank lines. */
export function normalizeMessageContent(raw: string) {
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return { ok: false as const, error: "Message can't be empty" };
  if (cleaned.length > CHAT_MAX_LENGTH) {
    return { ok: false as const, error: `Messages are limited to ${CHAT_MAX_LENGTH} characters` };
  }
  return { ok: true as const, content: maskProfanity(cleaned) };
}

/** `recentCount` = this user's messages in the last CHAT_RATE_LIMIT.windowMs. */
export function isRateLimited(recentCount: number) {
  return recentCount >= CHAT_RATE_LIMIT.messages;
}

/** Friends League creator and co-admins may delete any message in their league. */
export function canModerateChat(params: { leagueType: string; isCreator: boolean; isAdmin: boolean }) {
  return params.leagueType === "friends" && (params.isCreator || params.isAdmin);
}

// --- Automatic (system) messages -------------------------------------------
// Each has a key so it's posted at most once per league.

export const systemMessages = {
  joined: (userId: string, username: string) => ({
    key: `join:${userId}`,
    content: `${username} joined the league`,
  }),
  knockedOut: (userId: string, username: string, gameweek: number, team: string | null) => ({
    key: `ko:${userId}:${gameweek}`,
    content: team ? `${username} was knocked out (picked ${team})` : `${username} was knocked out (no pick for GW${gameweek})`,
  }),
  survived: (gameweek: number, usernames: string[]) => ({
    key: `survived:${gameweek}`,
    content: `${joinNames(usernames)} survived GW${gameweek} ✓`,
  }),
  lockReminder: (gameweek: number, minutesLeft: number) => ({
    key: `lock:${gameweek}`,
    content: minutesLeft >= 55 ? "Picks lock in 1 hour" : `Picks lock in ${Math.max(1, minutesLeft)} minutes`,
  }),
};

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "Nobody";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length <= 5) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, 4).join(", ")} and ${names.length - 4} others`;
}

/** A lock reminder is due within the final hour before a round locks. */
export function lockReminderDue(locksAt: Date | null, now = new Date()) {
  if (!locksAt) return null;
  const minutesLeft = Math.floor((locksAt.getTime() - now.getTime()) / 60_000);
  return minutesLeft >= 0 && minutesLeft <= 60 ? minutesLeft : null;
}
