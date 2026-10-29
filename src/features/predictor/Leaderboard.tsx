import { Coins } from "lucide-react";
import { normalizeApiError } from "../../services/api/error";
import { useGetPredictorLeaderboardQuery } from "../../services/api/knoxitApi";

function Movement({ value }: { value: number }) {
  if (value > 0) return <span className="text-[12px] font-bold text-emerald-400" aria-label={`up ${value}`}>▲{value}</span>;
  if (value < 0) return <span className="text-[12px] font-bold text-red-400" aria-label={`down ${-value}`}>▼{-value}</span>;
  return <span className="text-[12px] text-zinc-600" aria-label="no change">–</span>;
}

export function Leaderboard({ leagueId, onOpenProfile }: { leagueId: string; onOpenProfile: (userId: string) => void }) {
  const query = useGetPredictorLeaderboardQuery(leagueId, { refetchOnMountOrArgChange: true });

  if (query.isLoading) return <div className="pt-10 text-center text-[12px] text-zinc-500">Loading leaderboard…</div>;
  if (query.isError || !query.data) {
    return (
      <div className="pt-10 text-center">
        <div className="text-[12px] text-red-300">{query.error ? normalizeApiError(query.error).message : "Could not load the leaderboard."}</div>
        <button onClick={() => query.refetch()} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[12px] text-zinc-300">Try again</button>
      </div>
    );
  }

  const board = query.data;
  const split = board.prizeSplit;
  return (
    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
      {board.vaultChips !== null && split ? (
        <section className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-[12px] font-bold uppercase tracking-wide text-amber-400"><Coins size={12} /> {board.final ? "Prizes paid" : "Vault"}</span>
            <span className="text-[16px] font-extrabold text-amber-300">{board.vaultChips.toLocaleString()} chips</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[12px] text-zinc-400">
            {split.map((percent, index) => (
              <div key={percent} className="rounded-lg bg-black/20 py-1">
                <div className="font-bold text-white">{["1st", "2nd", "3rd"][index]} · {percent}%</div>
                <div>{Math.floor((board.vaultChips! * percent) / 100).toLocaleString()} chips</div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-[12px] text-zinc-500">
            {board.final ? "Mini-season finished — prizes are in the winners' balances." : `Paid when GW${board.endGameweek} finishes.`} Ties share the prizes of the places they occupy.
          </div>
        </section>
      ) : null}

      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[12px] uppercase tracking-wide text-zinc-500">
            <th className="w-8 py-1 text-left">#</th>
            <th className="w-6" aria-label="Movement" />
            <th className="py-1 text-left">Player</th>
            <th className="w-12 py-1 text-right">Correct</th>
            <th className="w-10 py-1 text-right">Exact</th>
            <th className="w-10 py-1 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row) => (
            <tr key={row.userId} data-you={row.isYou || undefined} className={row.isYou ? "bg-[var(--theme-primary-soft)]" : ""}>
              <td className="py-2 pl-1 font-bold text-zinc-300">{["🥇", "🥈", "🥉"][row.rank - 1] ?? row.rank}</td>
              <td><Movement value={row.movement} /></td>
              <td className="py-2">
                <button onClick={() => onOpenProfile(row.userId)} className="text-left font-semibold text-white">
                  {row.username}{row.isYou ? " (you)" : ""}
                </button>
                {row.projectedPrize > 0 ? (
                  <div className="text-[12px] text-amber-400">
                    {row.projectedPrize.toLocaleString()} chips{board.final ? " won" : " if it ended now"}
                  </div>
                ) : null}
              </td>
              <td className="py-2 text-right tabular-nums text-zinc-300">{row.correct}</td>
              <td className="py-2 text-right tabular-nums text-zinc-300">{row.exact}</td>
              <td className="py-2 pr-1 text-right font-extrabold tabular-nums text-white">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-[12px] leading-snug text-zinc-600">Ties broken by points, then exact scores, then correct results, then Joker points.</div>
    </div>
  );
}
