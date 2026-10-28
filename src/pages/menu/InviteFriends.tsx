// artifacts/knoxit/src/pages/menu/InviteFriends.tsx
// Route: /menu/invite
//
// Deliberately kept separate and simpler than Refer & Earn (per explicit
// request, 25 Jul 2026) — this is just a quick "share the app" action,
// not the stats/rewards-focused page. Both use the same underlying
// referral code under the hood.
import { useState } from "react";
import { Share2, MessageCircle } from "lucide-react";
import { SubHeader } from "../../components/Header";
import { useGetReferralQuery } from "../../services/api/knoxitApi";

export default function InviteFriends() {
  const referralQuery = useGetReferralQuery();
  const referralCode = referralQuery.data?.referralCode ?? null;
  const [copied, setCopied] = useState(false);

  const share = () => {
    const signupLink = `${window.location.origin}/signup`;
    const shareText = referralCode
      ? `Join me on Knoxit — pick a team to survive each Gameweek, last one standing wins the vault! Use my code ${referralCode} to get free chips: ${signupLink}`
      : `Join me on Knoxit — pick a team to survive each Gameweek, last one standing wins the vault! ${signupLink}`;

    if (navigator.share) {
      navigator.share({ title: "Join me on Knoxit", text: shareText }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <>
      <SubHeader title="Invite Friends" onBack={() => window.history.back()} />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mb-4">
          <Share2 size={24} className="text-violet-300" />
        </div>
        <div className="text-white text-[15px] font-bold mb-1">Bring your friends into the game</div>
        <div className="text-zinc-500 text-[12px] mb-6 max-w-[260px]">
          Send them your invite link. More survivors, more banter, bigger leagues.
        </div>
        {referralCode ? (
          <div className="mb-4 text-[11px] text-zinc-400">
            Your code: <span className="font-bold tracking-[0.15em] text-white">{referralCode}</span>
          </div>
        ) : null}

        <button
          onClick={share}
          disabled={referralQuery.isLoading}
          className="w-full bg-emerald-500 text-black font-bold text-[13px] rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <MessageCircle size={16} /> {copied ? "Invite copied" : "Share Invite Link"}
        </button>
      </div>
    </>
  );
}
