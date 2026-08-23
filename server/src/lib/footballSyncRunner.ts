import { syncAllFootballData, type FootballSyncMode } from "./syncFootballData";

export type FootballSyncSource = "api" | "scheduler";

type ActiveSync = {
  source: FootballSyncSource;
  mode: FootballSyncMode;
  startedAt: string;
};

type LastSync = ActiveSync & {
  completedAt: string;
  ok: boolean;
  error?: string;
};

let activeSync: ActiveSync | null = null;
let lastSync: LastSync | null = null;

export class FootballSyncInProgressError extends Error {
  constructor(public readonly active: ActiveSync) {
    super("A football sync is already running");
    this.name = "FootballSyncInProgressError";
  }
}

export function getFootballSyncStatus() {
  return { active: activeSync, last: lastSync };
}

export async function runFootballSync(source: FootballSyncSource, mode: FootballSyncMode) {
  if (activeSync) throw new FootballSyncInProgressError(activeSync);

  const current: ActiveSync = {
    source,
    mode,
    startedAt: new Date().toISOString(),
  };
  activeSync = current;

  try {
    const results = await syncAllFootballData(mode);
    lastSync = {
      ...current,
      completedAt: new Date().toISOString(),
      ok: true,
    };
    return results;
  } catch (error) {
    lastSync = {
      ...current,
      completedAt: new Date().toISOString(),
      ok: false,
      error: error instanceof Error ? error.message : "Unknown football sync error",
    };
    throw error;
  } finally {
    activeSync = null;
  }
}
