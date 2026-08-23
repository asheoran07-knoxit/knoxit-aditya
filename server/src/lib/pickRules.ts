export type PickSelection = {
  primaryTeam: string;
  backupTeam: string | null;
};

export function usedTeamsInCurrentCycle(history: PickSelection[], poolSize: number) {
  let used = new Set<string>();

  for (const pick of history) {
    if (used.size >= poolSize) used = new Set<string>();
    used.add(pick.primaryTeam);
    if (pick.backupTeam) used.add(pick.backupTeam);
  }

  return used;
}

export function samePickSelection(
  existing: PickSelection,
  requested: { primaryTeam: string; backupTeam?: string }
) {
  return existing.primaryTeam === requested.primaryTeam
    && existing.backupTeam === (requested.backupTeam ?? null);
}
