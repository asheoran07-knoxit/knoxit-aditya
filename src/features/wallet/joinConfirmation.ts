// Copy for the "are you sure?" sheet shown before joining a league. Joining
// is final (no leave, no refund), so every join confirms; the cost line only
// appears when the league charges chips.

export type JoinConfirmationCopy = {
  title: string;
  balanceLine: string | null;
  note: string;
};

export function joinConfirmationCopy(params: {
  leagueName: string;
  entryFeeChips: number;
  balance: number | undefined;
}): JoinConfirmationCopy {
  const { leagueName, entryFeeChips, balance } = params;
  if (entryFeeChips <= 0) {
    return { title: `Join ${leagueName}?`, balanceLine: null, note: "Free entry. You can't leave after joining." };
  }
  return {
    title: `Join ${leagueName} for ${entryFeeChips.toLocaleString()} chips?`,
    balanceLine: balance === undefined
      ? null
      : `Your balance: ${balance.toLocaleString()} → ${(balance - entryFeeChips).toLocaleString()}`,
    note: "No refunds after joining.",
  };
}
