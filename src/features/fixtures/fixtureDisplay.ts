export function fixtureDisplay(status: string) {
  if (status === "FINISHED") return { showScore: true, label: "FT", live: false };
  if (status === "AWARDED") return { showScore: true, label: "AWARDED", live: false };
  if (status === "IN_PLAY" || status === "LIVE") return { showScore: true, label: "LIVE", live: true };
  if (status === "PAUSED") return { showScore: true, label: "HALF-TIME", live: true };
  if (status === "POSTPONED") return { showScore: false, label: "POSTPONED", live: false };
  if (status === "SUSPENDED") return { showScore: false, label: "SUSPENDED", live: false };
  if (status === "CANCELLED") return { showScore: false, label: "CANCELLED", live: false };
  return { showScore: false, label: status.replaceAll("_", " "), live: false };
}

// A match that won't be played (any more) this gameweek: it no longer keeps
// the gameweek "current". Postponed matches are replayed later, if at all.
const DONE_STATUSES = new Set(["FINISHED", "AWARDED", "CANCELLED", "POSTPONED"]);

/**
 * The gameweek to show as "Current": the provider's current matchday, moved
 * on to the next one once every match in it is over. Undefined if there are
 * no fixtures.
 */
export function currentGameweek(fixtures: Array<{ matchday: number | null; status: string }>, providerCurrent: number | null | undefined) {
  const byMatchday = new Map<number, string[]>();
  for (const fixture of fixtures) {
    if (fixture.matchday === null) continue;
    byMatchday.set(fixture.matchday, [...(byMatchday.get(fixture.matchday) ?? []), fixture.status]);
  }
  const matchdays = [...byMatchday.keys()].sort((a, b) => a - b);
  if (matchdays.length === 0) return providerCurrent ?? undefined;
  let index = providerCurrent == null ? 0 : matchdays.findIndex((matchday) => matchday >= providerCurrent);
  if (index === -1) return matchdays[matchdays.length - 1];
  while (index < matchdays.length - 1 && byMatchday.get(matchdays[index])!.every((status) => DONE_STATUSES.has(status))) index++;
  return matchdays[index];
}
