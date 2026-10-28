import { describe, expect, it } from "vitest";
import { chipShortfallPath, shopPathForJoinError } from "./chipShortfall";

describe("chip shortfall routing", () => {
  it("sends players to the Shop with the amount they need", () => {
    expect(chipShortfallPath(320)).toBe("/shop?need=320");
    expect(chipShortfallPath(0)).toBe("/shop");
  });

  it("routes the server's insufficient-chips rejection to the Shop", () => {
    const error = {
      status: 400,
      data: { error: "You need 500 chips. Your balance is 180 chips.", code: "INSUFFICIENT_CHIPS", required: 500, available: 180, shortfall: 320 },
    };
    expect(shopPathForJoinError(error)).toBe("/shop?need=320");
  });

  it("ignores other join errors", () => {
    expect(shopPathForJoinError({ status: 409, data: { error: "Entry for this round is locked" } })).toBeNull();
  });
});
