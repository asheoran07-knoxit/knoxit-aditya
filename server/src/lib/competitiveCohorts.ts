// Rules for placing a player into a competitive cohort (one 20-player league
// instance per competition + starting round).

/**
 * A cohort can take a new player only if it still charges the competition's
 * current entry fee and has room. A cohort opened under an older fee is never
 * filled further, so the fee a player confirmed is always the fee charged.
 */
export function cohortAcceptsJoin(
  cohort: { entryFeeChips: number; maxMembers: number | null },
  memberCount: number,
  currentEntryFeeChips: number
) {
  if (cohort.entryFeeChips !== currentEntryFeeChips) return false;
  return cohort.maxMembers === null || memberCount < cohort.maxMembers;
}

/** True when the client confirmed a fee that no longer matches the server's. */
export function entryFeeChanged(expectedEntryFeeChips: number | undefined, currentEntryFeeChips: number) {
  return expectedEntryFeeChips !== undefined && expectedEntryFeeChips !== currentEntryFeeChips;
}
