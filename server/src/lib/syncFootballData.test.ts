import { describe, expect, it, vi } from "vitest";

// The sync module opens the database lazily; stub it so this pure helper can be tested alone.
vi.mock("@db/index", () => ({ db: {} }));

const { isForeignKeyViolation } = await import("./syncFootballData");

describe("fixture sync: stale-fixture cleanup", () => {
  it("recognises a foreign key violation from the driver, wrapped or not", () => {
    expect(isForeignKeyViolation({ code: "23503" })).toBe(true);
    expect(isForeignKeyViolation({ message: "Failed query", cause: { code: "23503" } })).toBe(true);
  });

  it("lets every other error fail the sync", () => {
    expect(isForeignKeyViolation({ code: "23505" })).toBe(false);
    expect(isForeignKeyViolation(new Error("connection lost"))).toBe(false);
    expect(isForeignKeyViolation(null)).toBe(false);
  });
});
