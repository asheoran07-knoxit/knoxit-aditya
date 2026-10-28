import { describe, expect, it } from "vitest";
import { joinConfirmationCopy } from "./joinConfirmation";

describe("join confirmation copy", () => {
  it("states the cost and the balance before and after", () => {
    expect(joinConfirmationCopy({ leagueName: "Premier League Survivor", entryFeeChips: 500, balance: 1000 })).toEqual({
      title: "Join Premier League Survivor for 500 chips?",
      balanceLine: "Your balance: 1,000 → 500",
      note: "No refunds after joining.",
    });
  });

  it("still confirms a free league, without the cost line", () => {
    expect(joinConfirmationCopy({ leagueName: "Serie A Survivor", entryFeeChips: 0, balance: 1000 })).toEqual({
      title: "Join Serie A Survivor?",
      balanceLine: null,
      note: "Free entry. You can't leave after joining.",
    });
  });

  it("omits the balance line while the balance is unknown", () => {
    expect(joinConfirmationCopy({ leagueName: "La Liga Survivor", entryFeeChips: 500, balance: undefined }).balanceLine).toBeNull();
  });
});
