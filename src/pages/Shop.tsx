// artifacts/knoxit/src/pages/Shop.tsx
// Route: /shop
//
// 25 Jul 2026: Second Chance, Extra Pick, Double Week, and Safe Pick were
// all cut for granting a direct survival advantage — pay-to-win, conflicting
// with the "no pay-to-win" copy on this screen. Boosters now has Draw
// Shield, Team Recall, League Pulse, Opponent Reveal, Lock Extension.
// Featured is empty, reserved for future items.
//
// 25 Jul 2026: every item can now be earned TWO ways — chips, or watching
// a scaled number of rewarded ads (~1 ad per 200 chips of value). The ad
// path is simulated here with a plain button tap; the real version calls
// POST /api/shop/watch-ad only AFTER your ad network's server-side
// completion callback fires — never grant progress from a bare client
// claim, since that's trivially spoofable. See shop.ts's file header.
//
// 25 Jul 2026 FIX: Chip Packs was rendering below the tabs regardless of
// which tab was active, making it look like it appeared in both Featured
// and Boosters (it never actually duplicated in code, but never went away
// either). Now it only renders when the Boosters tab is selected, matching
// the person's request to keep it "in the boosters, not in the featured."
//
// Chip Packs (real money) are still NOT functional — no payment gateway
// exists yet. Shown disabled, not faked.
//
// Merch teaser redesigned to match reference: diagonal "COMING SOON"
// ribbon, centered lock icon, colored glow per category, title+subtitle
// below. First item (Jerseys) full-width/featured, rest in a 2-col grid.

import { useState } from "react";
import { Coins, Gift, Zap, Eye, Clock, Check, Equal, RotateCcw, PlayCircle, Lock, BarChart3 } from "lucide-react";
import { Header } from "../components/Header";
import { dailyReward, boosterItems, chipPacks, adsRequiredFor, merchTeasers } from "../services/mockData";
import { useGetChipBalanceQuery } from "../services/api/knoxitApi";

const iconMap: Record<string, any> = { Zap, Eye, Clock, Equal, RotateCcw, BarChart3 };

const merchAccent: Record<string, { from: string; via: string }> = {
  blue: { from: "from-blue-900/60", via: "via-blue-950/40" },
  sky: { from: "from-sky-900/50", via: "via-sky-950/30" },
  orange: { from: "from-orange-900/50", via: "via-orange-950/30" },
  red: { from: "from-red-900/50", via: "via-red-950/30" },
  amber: { from: "from-amber-900/50", via: "via-amber-950/30" },
  violet: { from: "from-violet-900/50", via: "via-violet-950/30" },
  emerald: { from: "from-emerald-900/50", via: "via-emerald-950/30" },
};

type Item = { id: string; name: string; description: string; cost: number; icon: string };

function ShopItemCard({
  item, balance, onPurchase, adProgress, onWatchAd,
}: {
  item: Item; balance: number; onPurchase: (item: Item) => void;
  adProgress: number; onWatchAd: (item: Item) => void;
}) {
  const Icon = iconMap[item.icon] ?? Zap;
  const affordable = balance >= item.cost;
  const adsRequired = adsRequiredFor(item.cost);
  const adsReady = adProgress >= adsRequired;

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
      <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center mb-2">
        <Icon size={16} className="text-emerald-400" />
      </div>
      <div className="text-white text-[13px] font-semibold mb-1">{item.name}</div>
      <div className="text-zinc-500 text-[10px] leading-snug mb-3">{item.description}</div>

      <button
        onClick={() => onPurchase(item)}
        disabled={!affordable}
        className="w-full flex items-center justify-center gap-1 bg-amber-500/15 disabled:bg-white/5 disabled:text-zinc-600 border border-amber-500/30 disabled:border-white/10 text-amber-300 text-[11px] font-bold rounded-lg py-1.5 mb-1.5"
      >
        <Coins size={11} /> {item.cost.toLocaleString()}
      </button>

      <button
        onClick={() => onWatchAd(item)}
        disabled={adsReady}
        className="w-full flex items-center justify-center gap-1 bg-violet-500/10 disabled:bg-emerald-500/15 border border-violet-500/25 disabled:border-emerald-500/40 text-violet-300 disabled:text-emerald-400 text-[10px] font-semibold rounded-lg py-1.5"
      >
        {adsReady ? (
          <><Check size={10} /> Ready — Claim</>
        ) : (
          <><PlayCircle size={10} /> Watch Ad ({adProgress}/{adsRequired})</>
        )}
      </button>
    </div>
  );
}

function MerchCard({ item, featured }: { item: (typeof merchTeasers)[number]; featured?: boolean }) {
  const a = merchAccent[item.accent] ?? merchAccent.blue;
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      <div className={`relative bg-gradient-to-br ${a.from} ${a.via} to-transparent flex items-center justify-center ${featured ? "h-28" : "h-20"} overflow-hidden`}>
        {/* Diagonal COMING SOON ribbon */}
        <div className="absolute -right-8 top-3 rotate-45 bg-red-500/90 text-white text-[8px] font-bold tracking-wider px-8 py-0.5 shadow">
          COMING SOON
        </div>
        <div className="w-11 h-11 rounded-full bg-black/30 flex items-center justify-center">
          <Lock size={18} className="text-amber-400/90" />
        </div>
      </div>
      <div className="px-3 py-2.5">
        <div className="text-white text-[13px] font-bold">{item.name}</div>
        <div className="text-zinc-500 text-[10px]">{item.subtitle}</div>
      </div>
    </div>
  );
}

export default function Shop() {
  const balanceQuery = useGetChipBalanceQuery();
  const balance = balanceQuery.data?.balance ?? 0;
  const [tab, setTab] = useState<"boosters" | "merch">("boosters");
  // Set when a league join bounced for lack of chips (see chipShortfallPath).
  const chipsNeeded = Number(new URLSearchParams(window.location.search).get("need")) || 0;
  const claimed = dailyReward.claimedToday;
  const [purchaseMsg, setPurchaseMsg] = useState<string | null>(null);
  const [adProgress, setAdProgress] = useState<Record<string, number>>({});

  const claimDaily = () => {
    if (claimed) return;
    setPurchaseMsg("Daily rewards are coming after the closed beta");
    setTimeout(() => setPurchaseMsg(null), 2000);
  };

  const purchase = (item: Item) => {
    if (balance < item.cost) return;
    setPurchaseMsg(`${item.name} is coming after the closed beta`);
    setTimeout(() => setPurchaseMsg(null), 2000);
  };

  const watchAd = (item: Item) => {
    // TODO: this button should trigger your ad SDK's rewarded-ad flow.
    // Only call POST /api/shop/watch-ad after the SDK's completion
    // callback fires — this simulated tap-to-increment is for demo/design
    // review only, not how real ad verification should work.
    const required = adsRequiredFor(item.cost);
    setAdProgress((prev) => {
      const current = prev[item.id] ?? 0;
      if (current >= required) {
        setPurchaseMsg(`${item.name} claimed via ads!`);
        setTimeout(() => setPurchaseMsg(null), 2000);
        return { ...prev, [item.id]: 0 };
      }
      return { ...prev, [item.id]: Math.min(current + 1, required) };
    });
  };

  const [featuredMerch, ...restMerch] = merchTeasers;

  return (
    <>
      <Header />
      {chipsNeeded > 0 ? (
        <div className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          You need {chipsNeeded.toLocaleString()} more chips to join that league.
        </div>
      ) : null}
      <div className="px-4 flex items-center justify-between mb-2">
        <div>
          <div className="text-white text-[16px] font-extrabold">Shop</div>
          <div className="text-zinc-500 text-[10px]">Power up your survival. Spend smart. Survive longer.</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-2">
        {purchaseMsg && (
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2 mb-3 text-emerald-400 text-[12px] font-semibold text-center">
            {purchaseMsg}
          </div>
        )}

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Gift size={16} className="text-amber-400" />
            </div>
            <div>
              <div className="text-white text-[12px] font-semibold">Daily Free Reward</div>
              <div className="text-zinc-500 text-[10px]">Come back tomorrow for more free chips!</div>
            </div>
          </div>
          <button
            onClick={claimDaily}
            disabled={claimed}
            className={`text-[11px] font-bold rounded-lg px-3 py-1.5 flex items-center gap-1 ${
              claimed ? "bg-white/5 text-zinc-500" : "bg-emerald-500 text-black"
            }`}
          >
            {claimed ? <><Check size={11} /> Claimed</> : `+${dailyReward.amount}`}
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          {([{ key: "boosters", label: "Boosters" }, { key: "merch", label: "Merch" }] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-[11px] font-bold rounded-lg py-2 border ${
                tab === t.key ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400" : "border-white/10 text-zinc-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "boosters" && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {boosterItems.map((item) => (
                <ShopItemCard
                  key={item.id}
                  item={item}
                  balance={balance}
                  onPurchase={purchase}
                  adProgress={adProgress[item.id] ?? 0}
                  onWatchAd={watchAd}
                />
              ))}
            </div>

            <div className="text-[11px] font-bold text-zinc-400 tracking-wide mb-2">CHIP PACKS</div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {chipPacks.map((pack) => (
                <div key={pack.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 relative">
                  {pack.bestValue && (
                    <span className="absolute top-2 right-2 text-[8px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-1.5 py-0.5">
                      BEST VALUE
                    </span>
                  )}
                  <div className="flex items-center gap-1 mb-1">
                    <Coins size={14} className="text-amber-400" />
                    <span className="text-white text-[15px] font-extrabold">{pack.chips.toLocaleString()}</span>
                  </div>
                  <div className="text-zinc-500 text-[10px] mb-2">chips</div>
                  {/* Deliberately disabled — no payment gateway wired up yet. */}
                  <button
                    disabled
                    className="w-full bg-white/5 border border-white/10 text-zinc-500 text-[11px] font-semibold rounded-lg py-1.5"
                  >
                    ₹{pack.priceINR} · Coming Soon
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "merch" && (
          <>
            <div className="mb-3">
              <MerchCard item={featuredMerch} featured />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {restMerch.map((item) => (
                <MerchCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}

        <div className="border border-white/10 rounded-xl px-3 py-3 mb-2">
          <div className="text-emerald-400 text-[11px] font-bold mb-1">SAFE & FAIR ECONOMY</div>
          <div className="text-zinc-500 text-[10px] leading-relaxed">
            No pay-to-win. Every item is designed to enhance your strategy, not guarantee results.
          </div>
        </div>
      </div>
    </>
  );
}
