import { Coins } from "lucide-react";
import { joinConfirmationCopy } from "../features/wallet/joinConfirmation";

// Bottom sheet asking the player to confirm a league join. The server is
// unchanged; this only adds the deliberate second tap.
export function JoinConfirmSheet({
  leagueName,
  entryFeeChips,
  balance,
  busy,
  onCancel,
  onConfirm,
}: {
  leagueName: string;
  entryFeeChips: number;
  balance: number | undefined;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = joinConfirmationCopy({ leagueName, entryFeeChips, balance });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="join-confirm-title">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full max-w-md rounded-t-2xl border border-white/10 bg-zinc-950 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
        <h2 id="join-confirm-title" className="text-[16px] font-bold leading-snug text-white">{copy.title}</h2>
        {copy.balanceLine ? (
          <div className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-amber-300">
            <Coins size={14} /> {copy.balanceLine}
          </div>
        ) : null}
        <div className="mt-2 text-[12px] text-zinc-400">{copy.note}</div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-white/10 bg-white/[0.03] py-3 text-[13px] font-semibold text-zinc-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-[var(--theme-primary)] py-3 text-[13px] font-bold text-[var(--theme-primary-text)] disabled:opacity-60"
          >
            {busy ? "Joining…" : "Join"}
          </button>
        </div>
      </div>
    </div>
  );
}
