import type { ChatMessage } from "../../services/api/knoxitApi";

const byCreated = (left: ChatMessage, right: ChatMessage) =>
  new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.id.localeCompare(right.id);

/**
 * Folds polled messages (new, or changed by a reaction/deletion) into the
 * list by id. Changes to messages older than the oldest one loaded are
 * ignored so they don't pop into the middle of history the user hasn't opened.
 */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const oldest = current[0] ? new Date(current[0].createdAt).getTime() : -Infinity;
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    if (!byId.has(message.id) && new Date(message.createdAt).getTime() < oldest) continue;
    byId.set(message.id, message);
  }
  return [...byId.values()].sort(byCreated);
}

/** Older page loaded via "Load earlier messages" goes on the front. */
export function prependMessages(current: ChatMessage[], older: ChatMessage[]) {
  const byId = new Map([...older, ...current].map((message) => [message.id, message]));
  return [...byId.values()].sort(byCreated);
}

/** Shows the viewer's own reaction toggle immediately; the next poll confirms it. */
export function toggleReactionLocally(messages: ChatMessage[], messageId: string, emoji: string) {
  return messages.map((message) => {
    if (message.id !== messageId) return message;
    const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
    let reactions;
    if (!existing) reactions = [...message.reactions, { emoji, count: 1, mine: true }];
    else if (existing.mine) {
      reactions = message.reactions
        .map((reaction) => (reaction.emoji === emoji ? { ...reaction, count: reaction.count - 1, mine: false } : reaction))
        .filter((reaction) => reaction.count > 0);
    } else {
      reactions = message.reactions.map((reaction) => (reaction.emoji === emoji ? { ...reaction, count: reaction.count + 1, mine: true } : reaction));
    }
    return { ...message, reactions };
  });
}

/** The partial name being typed after "@" at the caret, if any. */
export function mentionQuery(text: string, caret: number) {
  const match = /(^|\s)@([\w.-]*)$/.exec(text.slice(0, caret));
  if (!match) return null;
  return { query: match[2], start: caret - match[2].length - 1 };
}

export function insertMention(text: string, caret: number, username: string) {
  const query = mentionQuery(text, caret);
  if (!query) return { text, caret };
  const before = text.slice(0, query.start);
  const after = text.slice(caret);
  const inserted = `@${username} `;
  return { text: `${before}${inserted}${after}`, caret: before.length + inserted.length };
}

export type MessageSegment = { text: string; mention: boolean };

/** Splits text so "@name" is highlighted only when name is a league member. */
export function splitMentions(content: string, usernames: string[]): MessageSegment[] {
  const known = new Set(usernames.map((name) => name.toLowerCase()));
  const segments: MessageSegment[] = [];
  let last = 0;
  for (const match of content.matchAll(/@([\w.-]+)/g)) {
    const name = match[1].replace(/[.-]+$/, "");
    if (!known.has(name.toLowerCase())) continue;
    const start = match.index ?? 0;
    if (start > last) segments.push({ text: content.slice(last, start), mention: false });
    segments.push({ text: `@${name}`, mention: true });
    last = start + name.length + 1;
  }
  if (last < content.length) segments.push({ text: content.slice(last), mention: false });
  return segments;
}
