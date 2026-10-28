import type { PickDashboardItem } from "../../services/api/knoxitApi";
import { fixtureDisplay } from "../fixtures/fixtureDisplay";

export type PickDashboardGroups = {
  // Alive, before lock, no pick yet — the "don't get eliminated by forgetting" list.
  lockingSoon: PickDashboardItem[];
  // Pick in, still editable before lock.
  submitted: PickDashboardItem[];
  // Pick locked and the picked team's fixture is in play right now.
  live: PickDashboardItem[];
  // Pick locked, result not settled yet and the match isn't live.
  awaitingResults: PickDashboardItem[];
};

export function groupPickDashboard(items: PickDashboardItem[]): PickDashboardGroups {
  const groups: PickDashboardGroups = { lockingSoon: [], submitted: [], live: [], awaitingResults: [] };

  for (const item of items) {
    if (item.canSubmit) {
      groups.lockingSoon.push(item);
      continue;
    }
    if (!item.pick || item.pick.result !== "pending") continue;
    if (item.canEdit) groups.submitted.push(item);
    else if (item.fixture && fixtureDisplay(item.fixture.status).live) groups.live.push(item);
    else groups.awaitingResults.push(item);
  }

  const byLock = (left: PickDashboardItem, right: PickDashboardItem) =>
    new Date(left.locksAt ?? 0).getTime() - new Date(right.locksAt ?? 0).getTime();
  groups.lockingSoon.sort(byLock);
  groups.submitted.sort(byLock);
  return groups;
}

export type NextAction =
  | { kind: "pick"; item: PickDashboardItem }
  | { kind: "all_submitted"; nextLock: string | null }
  | { kind: "no_leagues" };

/** The single most useful thing to do next, for the Home card. */
export function nextAction(items: PickDashboardItem[], now: number): NextAction {
  if (items.length === 0) return { kind: "no_leagues" };
  const needsPick = groupPickDashboard(items).lockingSoon[0];
  if (needsPick) return { kind: "pick", item: needsPick };
  const upcomingLocks = items
    .filter((item) => item.memberStatus === "alive" && item.locksAt && new Date(item.locksAt).getTime() > now)
    .map((item) => item.locksAt as string)
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
  return { kind: "all_submitted", nextLock: upcomingLocks[0] ?? null };
}

export function pickedTeam(item: PickDashboardItem) {
  if (!item.pick) return null;
  return item.pick.usedBackup ? item.pick.backupTeam : item.pick.primaryTeam;
}

export function lockCountdown(locksAt: string | null, now: number) {
  if (!locksAt) return "Not scheduled";
  const milliseconds = new Date(locksAt).getTime() - now;
  if (milliseconds <= 0) return "Locked";
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
