import { describe, expect, it } from "vitest";
import {
  canModerateChat,
  CHAT_RATE_LIMIT,
  isRateLimited,
  isReactionEmoji,
  lockReminderDue,
  maskProfanity,
  normalizeMessageContent,
  systemMessages,
} from "./chatRules";

describe("chat message rules", () => {
  it("accepts up to 500 characters and rejects longer or empty messages", () => {
    expect(normalizeMessageContent("a".repeat(500))).toMatchObject({ ok: true });
    expect(normalizeMessageContent("a".repeat(501))).toEqual({ ok: false, error: "Messages are limited to 500 characters" });
    expect(normalizeMessageContent("   \n  ")).toEqual({ ok: false, error: "Message can't be empty" });
  });

  it("keeps HTML as literal text (clients render text, never markup)", () => {
    expect(normalizeMessageContent("<script>alert(1)</script> <b>hi</b>")).toEqual({
      ok: true,
      content: "<script>alert(1)</script> <b>hi</b>",
    });
  });

  it("strips control characters but keeps line breaks", () => {
    expect(normalizeMessageContent("hi\u0007\nthere\n\n\n\nmate")).toEqual({ ok: true, content: "hi\nthere\n\nmate" });
  });
});

describe("bad-word filter", () => {
  it("masks blocked words and their endings with ***", () => {
    expect(maskProfanity("what a fucking shitshow")).toBe("what a *** ***");
    expect(maskProfanity("Absolute BASTARD of a fixture")).toBe("Absolute *** of a fixture");
  });

  it("leaves ordinary words alone", () => {
    expect(maskProfanity("Scunthorpe pass the class assessment")).toBe("Scunthorpe pass the class assessment");
  });

  it("is applied to every posted message", () => {
    expect(normalizeMessageContent("you absolute wanker")).toEqual({ ok: true, content: "you absolute ***" });
  });
});

describe("rate limit", () => {
  it("allows 5 messages per 10 seconds and blocks the 6th", () => {
    expect(CHAT_RATE_LIMIT).toEqual({ messages: 5, windowMs: 10_000 });
    expect(isRateLimited(4)).toBe(false);
    expect(isRateLimited(5)).toBe(true);
  });
});

describe("chat permissions", () => {
  it("lets a Friends League creator or co-admin delete messages", () => {
    expect(canModerateChat({ leagueType: "friends", isCreator: true, isAdmin: false })).toBe(true);
    expect(canModerateChat({ leagueType: "friends", isCreator: false, isAdmin: true })).toBe(true);
  });

  it("does not let ordinary members, or anyone in a competitive league, delete", () => {
    expect(canModerateChat({ leagueType: "friends", isCreator: false, isAdmin: false })).toBe(false);
    expect(canModerateChat({ leagueType: "competitive", isCreator: false, isAdmin: true })).toBe(false);
  });

  it("only accepts the four reactions", () => {
    for (const emoji of ["😂", "🔥", "😭", "👏"]) expect(isReactionEmoji(emoji)).toBe(true);
    expect(isReactionEmoji("👍")).toBe(false);
    expect(isReactionEmoji("<img>")).toBe(false);
  });
});

describe("system messages", () => {
  it("words each automatic message and keys it so it posts once", () => {
    expect(systemMessages.joined("u1", "Rohit")).toEqual({ key: "join:u1", content: "Rohit joined the league" });
    expect(systemMessages.knockedOut("u2", "Aman", 9, "Arsenal")).toEqual({ key: "ko:u2:9", content: "Aman was knocked out (picked Arsenal)" });
    expect(systemMessages.knockedOut("u2", "Aman", 9, null).content).toBe("Aman was knocked out (no pick for GW9)");
    expect(systemMessages.survived(9, ["Ana", "Ben", "Cy"])).toEqual({ key: "survived:9", content: "Ana, Ben and Cy survived GW9 ✓" });
    expect(systemMessages.lockReminder(10, 60)).toEqual({ key: "lock:10", content: "Picks lock in 1 hour" });
    expect(systemMessages.lockReminder(10, 25).content).toBe("Picks lock in 25 minutes");
  });

  it("is due only within the final hour before lock", () => {
    const now = new Date("2026-10-30T12:00:00.000Z");
    expect(lockReminderDue(new Date("2026-10-30T12:59:00.000Z"), now)).toBe(59);
    expect(lockReminderDue(new Date("2026-10-30T13:30:00.000Z"), now)).toBeNull();
    expect(lockReminderDue(new Date("2026-10-30T11:59:00.000Z"), now)).toBeNull();
    expect(lockReminderDue(null, now)).toBeNull();
  });
});
