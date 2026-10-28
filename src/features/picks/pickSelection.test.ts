import { describe, expect, it } from "vitest";
import { BACKUP_CLEARED_NOTICE, choosePrimary, isBackupSelectable } from "./pickSelection";

describe("pick selection", () => {
  it("greys out the primary team in the backup list", () => {
    expect(isBackupSelectable("Arsenal", "Arsenal")).toBe(false);
    expect(isBackupSelectable("Chelsea", "Arsenal")).toBe(true);
    expect(isBackupSelectable("Arsenal", null)).toBe(true);
  });

  it("clears the backup with a notice when the primary is changed to it", () => {
    expect(choosePrimary("Chelsea", "Chelsea")).toEqual({ primary: "Chelsea", backup: null, notice: BACKUP_CLEARED_NOTICE });
  });

  it("keeps a different backup untouched", () => {
    expect(choosePrimary("Arsenal", "Chelsea")).toEqual({ primary: "Arsenal", backup: "Chelsea", notice: null });
  });
});
