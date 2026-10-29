import { describe, expect, it } from "vitest";
import { crestFileType } from "./crests";

describe("crest proxy", () => {
  it("accepts football-data crest filenames", () => {
    expect(crestFileType("57.png")).toBe("image/png");
    expect(crestFileType("PL.svg")).toBe("image/svg+xml");
    expect(crestFileType("c111.png")).toBe("image/png");
  });

  it("rejects anything that could reach another path or file type", () => {
    for (const file of ["../etc/passwd", "57.png?x=1", "a/b.png", "57.gif", "evil.html", ".png", "%2e%2e.png"]) {
      expect(crestFileType(file)).toBeNull();
    }
  });
});
