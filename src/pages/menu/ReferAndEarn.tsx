// artifacts/knoxit/src/pages/menu/ReferAndEarn.tsx
// Route: /menu/refer (also /menu/invite, which redirects here)
//
// Oct 2026: merged with the old Invite Friends page; both used the same
// referral code, so one menu item now covers sharing and the code.
import { useState } from "react";
import { Copy, Gift, MessageCircle } from "lucide-react";
import { SubHeader } from "../../components/Header";
import { useGetReferralQuery } from "../../services/api/knoxitApi";

// Mirrors REFERRAL_BONUS_CHIPS in server/src/routes/account.ts.
const BONUS_CHIPS = 200;

export default function ReferAndEarn() {
  const [copied, setCopied] = useState(false);
  const referralQuery = useGetReferralQuery();
  const referralCode = referralQuery.data?.referralCode ?? null;

  const [shared, setShared] = useState(false);
  const share = () => {
    const signupLink = `${window.location.origin}/signup`;
    const shareText = referralCode
      ? `Join me on Knoxit — pick a team to survive each Gameweek, or predict every score! Use my code ${referralCode} to get free chips: ${signupLink}`
      : `Join me on Knoxit — pick a team to survive each Gameweek, or predict every score! ${signupLink}`;
    if (navigator.share) {
      navigator.share({ title: "Join me on Knoxit", text: shareText }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(shareText);
      setShared(true);
      setTimeout(() => setShared(false), 1500);
    }
  };

  const copyCode = () => {
    if (!referralCode) return;
    navigator.clipboard?.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <SubHeader title="Invite & Earn" onBack={() => window.history.back()} />
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-2 pb-4">
        <div className="flex flex-col items-center text-center py-4 mb-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-3">
            <Gift size={24} className="text-emerald-400" />
          </div>
          <div className="text-white text-[15px] font-bold mb-1">Give {BONUS_CHIPS}, Get {BONUS_CHIPS}</div>
          <div className="text-zinc-500 text-[12px] max-w-[240px]">
            Share your code — when a friend uses it, you both get {BONUS_CHIPS} chips.
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 mb-4">
          <div className="text-zinc-500 text-[12px] font-bold mb-2 tracking-wide">YOUR REFERRAL CODE</div>
          {referralQuery.isError ? (
            <div className="flex items-center justify-between text-[12px] text-red-300">
              Could not load your code.
              <button onClick={() => referralQuery.refetch()} className="min-h-11 px-2 text-[12px] font-semibold text-zinc-300">Retry</button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-white text-[22px] font-extrabold tracking-[0.15em]">
                {referralQuery.isLoading ? "…" : referralCode ?? "Not assigned yet"}
              </span>
              <button
                onClick={copyCode}
                disabled={!referralCode}
                className="flex min-h-11 items-center gap-1 text-[12px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded-lg px-3 disabled:opacity-50"
              >
                <Copy size={12} /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={share}
          disabled={referralQuery.isLoading}
          className="mb-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-[14px] font-bold text-black disabled:opacity-60"
        >
          <MessageCircle size={16} /> {shared ? "Invite copied" : "Share invite link"}
        </button>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl px-3 py-3 flex items-center justify-between">
          <span className="text-zinc-400 text-[12px]">Friends referred so far</span>
          <span className="text-white text-[16px] font-bold">{referralQuery.data?.totalReferred ?? "…"}</span>
        </div>
      </div>
    </>
  );
}
