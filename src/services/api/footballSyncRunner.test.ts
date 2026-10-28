import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncAllFootballData } from "../../../server/src/lib/syncFootballData";
import {
  FootballSyncInProgressError,
  getFootballSyncStatus,
  runFootballSync,
} from "../../../server/src/lib/footballSyncRunner";
import { processFixtureResults } from "../../../server/src/lib/resultsEngine";

vi.mock("../../../server/src/lib/syncFootballData", () => ({
  syncAllFootballData: vi.fn(),
}));
vi.mock("../../../server/src/lib/resultsEngine", () => ({
  processFixtureResults: vi.fn(),
}));
vi.mock("../../../server/src/lib/systemMessages", () => ({
  postDueLockReminders: vi.fn().mockResolvedValue(0),
}));

const syncAllFootballDataMock = vi.mocked(syncAllFootballData);
const processFixtureResultsMock = vi.mocked(processFixtureResults);

describe("footballSyncRunner", () => {
  beforeEach(() => {
    syncAllFootballDataMock.mockReset();
    processFixtureResultsMock.mockReset();
    processFixtureResultsMock.mockResolvedValue({
      leaguesChecked: 0,
      friendsStartsPostponed: 0,
      joinRequestsAutoDeclined: 0,
      noPickEliminations: 0,
      picksResolved: 0,
      backupsActivated: 0,
      leaguesAdvanced: 0,
      leaguesCompleted: 0,
      predictionsScored: 0,
    });
  });

  it("records a successful sync", async () => {
    syncAllFootballDataMock.mockResolvedValueOnce([]);

    await expect(runFootballSync("scheduler", "fixtures")).resolves.toEqual([]);

    expect(syncAllFootballDataMock).toHaveBeenCalledWith("fixtures");
    expect(processFixtureResultsMock).toHaveBeenCalledOnce();
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
