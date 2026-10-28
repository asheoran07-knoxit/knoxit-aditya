import { normalizeApiError } from "../../services/api/error";

/** Where to send a player who can't afford a league's entry fee. */
export function chipShortfallPath(shortfall: number) {
  return shortfall > 0 ? `/shop?need=${Math.ceil(shortfall)}` : "/shop";
}

/**
 * The server rejects an unaffordable join with code INSUFFICIENT_CHIPS and the
 * exact shortfall; returns the Shop path for that case, otherwise null.
 */
export function shopPathForJoinError(error: unknown) {
  const normalized = normalizeApiError(error);
  if (normalized.code !== "INSUFFICIENT_CHIPS") return null;
  const data = (error as { data?: { shortfall?: unknown } }).data;
  return chipShortfallPath(typeof data?.shortfall === "number" ? data.shortfall : 0);
}
