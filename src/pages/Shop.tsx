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
// Oct 2026: boosters, the Daily Reward and chip packs aren't wired to the
// server yet, so they show as disabled "Coming soon" instead of fake
// "Claimed"/purchase/ad buttons that did nothing.
//
// Merch teaser redesigned to match reference: diagonal "COMING SOON"
// ribbon, centered lock icon, colored glow per category, title+subtitle
// below. First item (Jerseys) full-width/featured, rest in a 2-col grid.

import { useState } from "react";
import { Coins, Gift, Zap, Eye, Clock, Equal, RotateCcw, Lock, BarChart3 } from "lucide-react";
import { Header } from "../components/Header";
import { boosterItems, chipPacks, merchTeasers } from "../services/mockData";

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

function ShopItemCard({ item }: { item: Item }) {
  const Icon = iconMap[item.icon] ?? Zap;
  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15">
        <Icon size={16} className="text-emerald-400" />
      </div>
      <div className="mb-1 text-[13px] font-semibold text-white">{item.name}</div>
      <div className="mb-3 text-[12px] leading-snug text-zinc-500">{item.description}</div>
      <div className="mt-auto mb-2 flex items-center gap-1 text-[12px] font-semibold text-amber-300/80">
        <Coins size={12} /> {item.cost.toLocaleString()} chips
      </div>
      <button disabled className="min-h-11 w-full rounded-lg border border-white/10 bg-white/5 text-[12px] font-semibold text-zinc-500">
        Coming soon
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
        <div className="absolute -right-8 top-3 rotate-45 bg-red-500/90 text-white text-[12px] font-bold tracking-wider px-8 py-0.5 shadow">
          COMING SOON
        </div>
        <div className="w-11 h-11 rounded-full bg-black/30 flex items-center justify-center">
          <Lock size={18} className="text-amber-400/90" />
        </div>
      </div>
      <div className="px-3 py-2.5">
        <div className="text-white text-[13px] font-bold">{item.name}</div>
        <div className="text-zinc-500 text-[12px]">{item.subtitle}</div>
      </div>
    </div>
  );
}

export default function Shop() {
  const [tab, setTab] = useState<"boosters" | "merch">("boosters");
  // Set when a league join bounced for lack of chips (see chipShortfallPath).
  const chipsNeeded = Number(new URLSearchParams(window.location.search).get("need")) || 0;
  const [featuredMerch, ...restMerch] = merchTeasers;

  return (
    <>
      <Header />
      {chipsNeeded > 0 ? (
        <div className="mx-4 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          You need {chipsNeeded.toLocaleString()} more chips to join that league. Chip packs and the Daily Reward are coming soon.
        </div>
      ) : null}
      <div className="px-4 flex items-center justify-between mb-2">
        <div>
          <div className="text-white text-[16px] font-extrabold">Shop</div>
          <div className="text-zinc-500 text-[12px]">Boosters and chip packs are coming after the closed beta.</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-2">
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
              <Gift size={16} className="text-amber-400" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-white">Daily Free Reward</div>
              <div className="text-[12px] text-zinc-500">Free chips every day, after the closed beta.</div>
            </div>
          </div>
          <button disabled className="min-h-11 shrink-0 rounded-lg bg-white/5 px-3 text-[12px] font-semibold text-zinc-500">
            Coming soon
          </button>
        </div>

        <div className="flex gap-2 mb-3">
          {([{ key: "boosters", label: "Boosters" }, { key: "merch", label: "Merch" }] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-11 flex-1 text-[12px] font-bold rounded-lg border ${
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
                <ShopItemCard key={item.id} item={item} />
              ))}
            </div>

            <div className="text-[12px] font-bold text-zinc-400 tracking-wide mb-2">CHIP PACKS</div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {chipPacks.map((pack) => (
                <div key={pack.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 relative">
                  {pack.bestValue && (
                    <span className="absolute top-2 right-2 text-[12px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-1.5 py-0.5">
                      BEST VALUE
                    </span>
                  )}
                  <div className="flex items-center gap-1 mb-1">
                    <Coins size={14} className="text-amber-400" />
                    <span className="text-white text-[15px] font-extrabold">{pack.chips.toLocaleString()}</span>
                  </div>
                  <div className="text-zinc-500 text-[12px] mb-2">chips</div>
                  {/* Deliberately disabled — no payment gateway wired up yet. */}
                  <button
                    disabled
                    className="min-h-11 w-full bg-white/5 border border-white/10 text-zinc-500 text-[12px] font-semibold rounded-lg"
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

      </div>
    </>
  );
}
