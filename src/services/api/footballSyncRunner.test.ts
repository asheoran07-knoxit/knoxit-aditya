import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncAllFootballData } from "../../../server/src/lib/syncFootballData";
import {
  FootballSyncInProgressError,
  getFootballSyncStatus,
  runFootballSync,
} from "../../../server/src/lib/footballSyncRunner";

vi.mock("../../../server/src/lib/syncFootballData", () => ({
  syncAllFootballData: vi.fn(),
}));

const syncAllFootballDataMock = vi.mocked(syncAllFootballData);

describe("footballSyncRunner", () => {
  beforeEach(() => {
    syncAllFootballDataMock.mockReset();
  });

  it("records a successful sync", async () => {
    syncAllFootballDataMock.mockResolvedValueOnce([]);

    await expect(runFootballSync("scheduler", "fixtures")).resolves.toEqual([]);

    expect(syncAllFootballDataMock).toHaveBeenCalledWith("fixtures");
    expect(getFootballSyncStatus()).toMatchObject({
      active: null,
      last: { source: "scheduler", mode: "fixtures", ok: true },
    });
  });

  it("prevents a second sync from overlapping the active sync", async () => {
    let finishSync!: (value: []) => void;
    syncAllFootballDataMock.mockReturnValueOnce(new Promise((resolve) => {
      finishSync = resolve;
    }));

    const activeRun = runFootballSync("scheduler", "fixtures");

    await expect(runFootballSync("api", "full")).rejects.toBeInstanceOf(FootballSyncInProgressError);
    expect(getFootballSyncStatus().active).toMatchObject({ source: "scheduler", mode: "fixtures" });

    finishSync([]);
    await activeRun;
  });

  it("records the last failure and releases the lock", async () => {
    syncAllFootballDataMock.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(runFootballSync("api", "standings")).rejects.toThrow("provider unavailable");

    expect(getFootballSyncStatus()).toMatchObject({
      active: null,
      last: { source: "api", mode: "standings", ok: false, error: "provider unavailable" },
    });
  });
});
