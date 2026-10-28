import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../services/api/knoxitApi";
import { insertMention, mentionQuery, mergeMessages, prependMessages, splitMentions, toggleReactionLocally } from "./chatMessages";

const message = (id: string, minute: number, content = id): ChatMessage => ({
  id,
  kind: "user",
  userId: "u1",
  username: "ana",
  authorStatus: "alive",
  content,
  deleted: false,
  createdAt: `2026-10-30T12:${String(minute).padStart(2, "0")}:00.000Z`,
  updatedAt: `2026-10-30T12:${String(minute).padStart(2, "0")}:00.000Z`,
  reactions: [],
});

describe("merging polled messages", () => {
  it("appends new messages in time order and replaces changed ones", () => {
    const merged = mergeMessages([message("a", 1), message("b", 2)], [message("c", 3), { ...message("a", 1), deleted: true }]);
    expect(merged.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(merged[0].deleted).toBe(true);
  });

  it("ignores changes to history that isn't loaded", () => {
    expect(mergeMessages([message("b", 5)], [message("old", 1)]).map((item) => item.id)).toEqual(["b"]);
  });

  it("puts an earlier page in front without duplicates", () => {
    expect(prependMessages([message("b", 5)], [message("a", 1), message("b", 5)]).map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("reacting", () => {
  it("adds, counts and removes the viewer's own reaction", () => {
    const start = [{ ...message("a", 1), reactions: [{ emoji: "🔥", count: 2, mine: false }] }];
    const added = toggleReactionLocally(start, "a", "🔥");
    expect(added[0].reactions).toEqual([{ emoji: "🔥", count: 3, mine: true }]);
    expect(toggleReactionLocally(added, "a", "🔥")[0].reactions).toEqual([{ emoji: "🔥", count: 2, mine: false }]);
    expect(toggleReactionLocally(start, "a", "😂")[0].reactions).toContainEqual({ emoji: "😂", count: 1, mine: true });
    expect(toggleReactionLocally(toggleReactionLocally(start, "a", "😂"), "a", "😂")[0].reactions).toEqual(start[0].reactions);
  });
});

describe("@mentions", () => {
  it("detects the name being typed after @", () => {
    expect(mentionQuery("hey @ro", 7)).toEqual({ query: "ro", start: 4 });
    expect(mentionQuery("@", 1)).toEqual({ query: "", start: 0 });
    expect(mentionQuery("email@ro", 8)).toBeNull();
  });

  it("inserts the chosen member", () => {
    expect(insertMention("hey @ro", 7, "rohit07")).toEqual({ text: "hey @rohit07 ", caret: 13 });
  });

  it("highlights only names of league members", () => {
    expect(splitMentions("gg @Rohit07 and @nobody!", ["rohit07"])).toEqual([
      { text: "gg ", mention: false },
      { text: "@Rohit07", mention: true },
      { text: " and @nobody!", mention: false },
    ]);
  });
});
