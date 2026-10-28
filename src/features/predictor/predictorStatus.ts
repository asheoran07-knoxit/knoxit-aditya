import type { PredictorDashboardItem } from "../../services/api/knoxitApi";

export type PredictorSummary =
  | { kind: "no_leagues" }
  | { kind: "to_predict"; toPredict: number; total: number; firstLock: string | null; leagueId: string }
  | { kind: "all_predicted"; nextLock: string | null; leagueId: string };

/**
 * One line for Home across every Predictor league, e.g. "7 of 10 to predict
 * · first lock in 5h". Tapping goes to the league whose deadline is soonest.
 */
export function summarizePredictor(items: PredictorDashboardItem[]): PredictorSummary {
  if (items.length === 0) return { kind: "no_leagues" };
  const byLock = (left: PredictorDashboardItem, right: PredictorDashboardItem) =>
    new Date(left.nextLock ?? "9999-12-31").getTime() - new Date(right.nextLock ?? "9999-12-31").getTime();
  const pending = items.filter((item) => item.toPredict > 0).sort(byLock);
  if (pending.length) {
    return {
      kind: "to_predict",
      toPredict: pending.reduce((sum, item) => sum + item.toPredict, 0),
      total: pending.reduce((sum, item) => sum + item.totalMatches, 0),
      firstLock: pending[0].nextLock,
      leagueId: pending[0].leagueId,
    };
  }
  const soonest = [...items].sort(byLock)[0];
  return { kind: "all_predicted", nextLock: soonest.nextLock, leagueId: soonest.leagueId };
}
