import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../services/api/knoxitApi";
import { groupJoinMessages } from "./chatMessages";

const message = (id: string, content: string, createdAt: string, kind: ChatMessage["kind"] = "system"): ChatMessage => ({
  id, kind, content, createdAt, updatedAt: createdAt, userId: kind === "user" ? "u1" : null, username: kind === "user" ? "amy" : null,
  authorStatus: null, deleted: false, reactions: [],
});
const day = (iso: string) => iso.slice(0, 10);

describe("chat join grouping", () => {
  it("folds consecutive joins into one item", () => {
    const items = groupJoinMessages([
      message("1", "amy joined the league", "2026-10-29T10:00:00Z"),
      message("2", "bob joined the league", "2026-10-29T10:01:00Z"),
      message("3", "cat joined the league", "2026-10-29T10:02:00Z"),
      message("4", "hi all", "2026-10-29T10:03:00Z", "user"),
    ], day);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: "joined", usernames: ["amy", "bob", "cat"] });
    expect(items[1]).toMatchObject({ type: "message" });
  });

  it("leaves a single join and other system messages alone, and never groups across days", () => {
    const items = groupJoinMessages([
      message("1", "amy joined the league", "2026-10-29T23:59:00Z"),
      message("2", "bob joined the league", "2026-10-30T00:01:00Z"),
      message("3", "GW9 survivors: amy", "2026-10-30T00:02:00Z"),
    ], day);
    expect(items.map((item) => item.type)).toEqual(["message", "message", "message"]);
  });
});
