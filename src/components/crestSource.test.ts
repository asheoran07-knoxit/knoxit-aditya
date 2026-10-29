import { describe, expect, it } from "vitest";
import { crestInitials, crestSource } from "./crestSource";

describe("crests", () => {
  it("serves football-data crests through our API", () => {
    expect(crestSource("https://crests.football-data.org/57.png")).toBe("/api/crests/57.png");
    expect(crestSource("https://crests.football-data.org/PL.png", "https://app.example")).toBe("https://app.example/api/crests/PL.png");
  });

  it("leaves other or unusual URLs alone and handles missing crests", () => {
    expect(crestSource("https://example.com/x.png")).toBe("https://example.com/x.png");
    expect(crestSource("https://crests.football-data.org/a/b.png")).toBe("https://crests.football-data.org/a/b.png");
    expect(crestSource(null)).toBeNull();
    expect(crestSource("")).toBeNull();
  });

  it("makes two-letter initials, skipping words like FC", () => {
    expect(crestInitials("Manchester United FC")).toBe("MU");
    expect(crestInitials("Arsenal FC")).toBe("AR");
    expect(crestInitials("AFC Bournemouth")).toBe("BO");
    expect(crestInitials("Wolverhampton Wanderers FC")).toBe("WW");
    expect(crestInitials("FC")).toBe("FC");
  });
});
