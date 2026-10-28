import { describe, expect, it } from "vitest";
import { cohortAcceptsJoin, entryFeeChanged } from "./competitiveCohorts";

describe("competitive cohort allocation", () => {
  it("fills a cohort with room that charges the current fee", () => {
    expect(cohortAcceptsJoin({ entryFeeChips: 500, maxMembers: 20 }, 3, 500)).toBe(true);
  });

  it("never fills an old cohort opened under a different fee", () => {
    // The PL-26-R9-1 case: a free cohort must not take players once the fee is 500.
    expect(cohortAcceptsJoin({ entryFeeChips: 0, maxMembers: 20 }, 3, 500)).toBe(false);
  });

  it("skips full cohorts", () => {
    expect(cohortAcceptsJoin({ entryFeeChips: 500, maxMembers: 20 }, 20, 500)).toBe(false);
  });
});

describe("confirmed entry fee", () => {
  it("accepts a join confirmed at the current fee", () => {
    expect(entryFeeChanged(500, 500)).toBe(false);
  });

  it("rejects a join confirmed at a different fee", () => {
    expect(entryFeeChanged(0, 500)).toBe(true);
  });

  it("allows older clients that don't send a fee", () => {
    expect(entryFeeChanged(undefined, 500)).toBe(false);
  });
});
