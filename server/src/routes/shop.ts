// artifacts/api-server/src/routes/shop.ts
//
// Three genuinely different kinds of "acquire an item" here, handled very
// differently:
//
// 1. Chips (SHOP_ITEMS below) — bought with chips already in the user's
//    balance. Fully real: uses applyChipTransaction from chipLedger.ts.
//
// 2. Watch ads (25 Jul 2026 decision) — an alternative free path. Watch N
//    rewarded ads instead of paying chips, N scaled to the item's chip
//    cost (~1 ad per 200 chips of value). CRITICAL: ad completion must be
//    verified server-side via your ad network SDK's server-to-server
//    callback/webhook (e.g. AdMob SSV, Unity Ads server callbacks) — never
//    grant progress from a bare client call claiming "I watched it", since
//    that's trivially spoofable. The watch-ad route below is written
//    assuming that verification already happened upstream; wire the real
//    callback in front of it.
//
// 3. Chip Packs (real money) — deliberately NOT implemented here beyond a
//    stub that returns 501. Needs a real payment gateway (Stripe/IAP).

import { Router } from "express";
import { db } from "@db/index";
import { chipLedger, activeBoosters, adRewardProgress, picks } from "@db/schema";
import { eq, and, gte, desc, count } from "drizzle-orm";
import { applyChipTransaction, InsufficientChipsError, getChipBalance } from "../lib/chipLedger";

export const shopRouter = Router();

// ---------------------------------------------------------------------------
// Item catalog — static for now (fixed at launch). Move to a DB table if
// you need to change prices/items without a redeploy later.
// ---------------------------------------------------------------------------

// Extra Pick, Double Week, Second Chance, and Safe Pick were all removed
// from the catalog (25 Jul 2026) — every one of them directly increased
// survival odds (a second pick, reviving from elimination, or protecting
// a pick from elimination), conflicting with the "no pay-to-win"
// positioning shown on the Shop screen itself. The Featured/Boosters
// grouping on the frontend is kept separate (Featured is empty for now,
// not merged into Boosters) since new Featured items are planned.
const SHOP_ITEMS: Record<string, { name: string; cost: number }> = {
  draw_shield: { name: "Draw Shield", cost: 1000 },
  team_recall: { name: "Team Recall", cost: 1800 },
  league_pulse: { name: "League Pulse", cost: 700 },
  opponent_reveal: { name: "Opponent Reveal", cost: 750 },
  lock_extension: { name: "Lock Extension", cost: 600 },
};

// Ads-required scales with the item's chip cost (~1 ad per 200 chips,
// rounded up) — validated against the person's own example: Draw Shield
// (1000 chips) → 5 ads.
const CHIPS_PER_AD = 200;
function adsRequiredFor(itemId: string): number {
  const item = SHOP_ITEMS[itemId];
  if (!item) throw new Error(`Unknown item: ${itemId}`);
  return Math.ceil(item.cost / CHIPS_PER_AD);
}



const DAILY_REWARD_CHIPS = 25;

/**
 * Checks if the user has watched enough ads for this item; if so, resets
 * their progress to 0 and returns true (the "credit" is consumed). Returns
 * false if they're not there yet — caller should reject the free-via-ads
 * request in that case, not silently fall back to chips.
 */
async function consumeAdCredit(userId: string, itemId: string): Promise<boolean> {
  const required = adsRequiredFor(itemId);
  const [progress] = await db
    .select()
    .from(adRewardProgress)
    .where(and(eq(adRewardProgress.userId, userId), eq(adRewardProgress.itemId, itemId)));

  if (!progress || progress.viewsCompleted < required) return false;

  await db
    .update(adRewardProgress)
    .set({ viewsCompleted: 0, updatedAt: new Date() })
    .where(eq(adRewardProgress.id, progress.id));
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/shop/watch-ad — call this AFTER your ad network's server-side
// verification confirms a completed rewarded-ad view (see file header —
// do not call this directly from a bare client claim).
// ---------------------------------------------------------------------------

shopRouter.post("/watch-ad", async (req, res) => {
  const userId = req.userId as string;
  const itemId = req.body?.itemId as string;

  if (!SHOP_ITEMS[itemId]) return res.status(400).json({ error: `Unknown item: ${itemId}` });
  const required = adsRequiredFor(itemId);

  const [existing] = await db
    .select()
    .from(adRewardProgress)
    .where(and(eq(adRewardProgress.userId, userId), eq(adRewardProgress.itemId, itemId)));

  let viewsCompleted: number;
  if (existing) {
    viewsCompleted = Math.min(existing.viewsCompleted + 1, required);
    await db
      .update(adRewardProgress)
      .set({ viewsCompleted, updatedAt: new Date() })
      .where(eq(adRewardProgress.id, existing.id));
  } else {
    viewsCompleted = 1;
    await db.insert(adRewardProgress).values({ userId, itemId, viewsCompleted });
  }

  res.json({ itemId, viewsCompleted, viewsRequired: required, ready: viewsCompleted >= required });
});

// ---------------------------------------------------------------------------
// GET /api/shop/ad-progress — current ad-view progress across all items,
// powers the progress rings/counters on each Shop item card
// ---------------------------------------------------------------------------

shopRouter.get("/ad-progress", async (req, res) => {
  const userId = req.userId as string;
  const rows = await db.select().from(adRewardProgress).where(eq(adRewardProgress.userId, userId));

  const progress = Object.keys(SHOP_ITEMS).map((itemId) => {
    const row = rows.find((r) => r.itemId === itemId);
    return {
      itemId,
      viewsCompleted: row?.viewsCompleted ?? 0,
      viewsRequired: adsRequiredFor(itemId),
    };
  });

  res.json(progress);
});

// ---------------------------------------------------------------------------
// POST /api/shop/draw-shield/activate — buy AND activate Draw Shield for a
// specific league + gameweek in one step. Generic /purchase above isn't
// enough for this item since resolvePick() needs to know exactly which
// pick to check it against.
// ---------------------------------------------------------------------------

shopRouter.post("/draw-shield/activate", async (req, res) => {
  const userId = req.userId as string;
  const { leagueId, gameweek, viaAds } = req.body ?? {};

  if (!leagueId || !gameweek) {
    return res.status(400).json({ error: "leagueId and gameweek are required" });
  }

  const [existing] = await db
    .select()
    .from(activeBoosters)
    .where(
      and(
        eq(activeBoosters.userId, userId),
        eq(activeBoosters.leagueId, leagueId),
        eq(activeBoosters.gameweek, gameweek),
        eq(activeBoosters.boosterType, "draw_shield")
      )
    );
  if (existing) {
    return res.status(400).json({ error: "Draw Shield is already active for this pick" });
  }

  try {
    let balanceAfter: number | undefined;

    if (viaAds) {
      const earned = await consumeAdCredit(userId, "draw_shield");
      if (!earned) {
        return res.status(400).json({ error: "You haven't watched enough ads for this yet." });
      }
      balanceAfter = await getChipBalance(userId); // unchanged, just reporting current balance
    } else {
      const result = await applyChipTransaction({
        userId,
        leagueId,
        type: "shop_purchase",
        amount: -SHOP_ITEMS.draw_shield.cost,
        note: `Draw Shield activated for GW${gameweek}`,
      });
      balanceAfter = result.balanceAfter;
    }

    const [booster] = await db
      .insert(activeBoosters)
      .values({ userId, leagueId, gameweek, boosterType: "draw_shield" })
      .returning();

    res.json({ activated: booster, balanceAfter, viaAds: Boolean(viaAds) });
  } catch (err) {
    if (err instanceof InsufficientChipsError) {
      return res.status(400).json({ error: "Not enough chips to activate Draw Shield" });
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// POST /api/shop/team-recall/activate — buy AND activate Team Recall for a
// specific team + gameweek. Capped at ONCE PER LEAGUE, for that user's
// entire time in the league — not once per gameweek like Draw Shield.
// This is the core rule (25 Jul 2026 decision) that makes this booster
// acceptable despite bypassing the team-pool-reuse rule: it can't be
// bought repeatedly to trivialize the whole season, only ever once.
// ---------------------------------------------------------------------------

shopRouter.post("/team-recall/activate", async (req, res) => {
  const userId = req.userId as string;
  const { leagueId, gameweek, team, viaAds } = req.body ?? {};

  if (!leagueId || !gameweek || !team) {
    return res.status(400).json({ error: "leagueId, gameweek, and team are required" });
  }

  // Lifetime-per-league check — deliberately NOT scoped to gameweek, unlike
  // Draw Shield. Any prior team_recall row for this user+league at all
  // (any gameweek, used or not) blocks another purchase, REGARDLESS of
  // whether it was chip- or ad-acquired — the once-per-league cap applies
  // no matter how it was paid for.
  const [existing] = await db
    .select()
    .from(activeBoosters)
    .where(
      and(
        eq(activeBoosters.userId, userId),
        eq(activeBoosters.leagueId, leagueId),
        eq(activeBoosters.boosterType, "team_recall")
      )
    );
  if (existing) {
    return res.status(400).json({ error: "Team Recall can only be used once per league, and you've already used it here." });
  }

  try {
    let balanceAfter: number | undefined;

    if (viaAds) {
      const earned = await consumeAdCredit(userId, "team_recall");
      if (!earned) {
        return res.status(400).json({ error: "You haven't watched enough ads for this yet." });
      }
      balanceAfter = await getChipBalance(userId);
    } else {
      const result = await applyChipTransaction({
        userId,
        leagueId,
        type: "shop_purchase",
        amount: -SHOP_ITEMS.team_recall.cost,
        note: `Team Recall activated for GW${gameweek} — ${team}`,
      });
      balanceAfter = result.balanceAfter;
    }

    const [booster] = await db
      .insert(activeBoosters)
      .values({ userId, leagueId, gameweek, boosterType: "team_recall", team })
      .returning();

    res.json({ activated: booster, balanceAfter, viaAds: Boolean(viaAds) });
  } catch (err) {
    if (err instanceof InsufficientChipsError) {
      return res.status(400).json({ error: "Not enough chips to activate Team Recall" });
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// POST /api/shop/league-pulse/activate — buy AND activate League Pulse for
// a specific league + gameweek. Simpler than Draw Shield/Team Recall — no
// elimination logic involved at all, it's purely a read-access grant to
// an aggregate query (see GET /league-pulse/:leagueId/:gameweek below).
// ---------------------------------------------------------------------------

shopRouter.post("/league-pulse/activate", async (req, res) => {
  const userId = req.userId as string;
  const { leagueId, gameweek, viaAds } = req.body ?? {};

  if (!leagueId || !gameweek) {
    return res.status(400).json({ error: "leagueId and gameweek are required" });
  }

  const [existing] = await db
    .select()
    .from(activeBoosters)
    .where(
      and(
        eq(activeBoosters.userId, userId),
        eq(activeBoosters.leagueId, leagueId),
        eq(activeBoosters.gameweek, gameweek),
        eq(activeBoosters.boosterType, "league_pulse")
      )
    );
  if (existing) {
    return res.status(400).json({ error: "League Pulse is already active for this gameweek" });
  }

  try {
    let balanceAfter: number;

    if (viaAds) {
      const earned = await consumeAdCredit(userId, "league_pulse");
      if (!earned) {
        return res.status(400).json({ error: "You haven't watched enough ads for this yet." });
      }
      balanceAfter = await getChipBalance(userId);
    } else {
      const result = await applyChipTransaction({
        userId,
        leagueId,
        type: "shop_purchase",
        amount: -SHOP_ITEMS.league_pulse.cost,
        note: `League Pulse activated for GW${gameweek}`,
      });
      balanceAfter = result.balanceAfter;
    }

    const [booster] = await db
      .insert(activeBoosters)
      .values({ userId, leagueId, gameweek, boosterType: "league_pulse" })
      .returning();

    res.json({ activated: booster, balanceAfter, viaAds: Boolean(viaAds) });
  } catch (err) {
    if (err instanceof InsufficientChipsError) {
      return res.status(400).json({ error: "Not enough chips to activate League Pulse" });
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// GET /api/shop/league-pulse/:leagueId/:gameweek — the actual payoff: what
// % of the league picked each team. Gated on having an active League Pulse
// for this exact league+gameweek — otherwise 403. Doesn't reveal WHO
// picked what, only the aggregate breakdown, so it doesn't leak individual
// opponents' picks (that's what Opponent Reveal is for, separately).
// ---------------------------------------------------------------------------

shopRouter.get("/league-pulse/:leagueId/:gameweek", async (req, res) => {
  const userId = req.userId as string;
  const leagueId = req.params.leagueId;
  const gameweek = Number(req.params.gameweek);

  const [access] = await db
    .select()
    .from(activeBoosters)
    .where(
      and(
        eq(activeBoosters.userId, userId),
        eq(activeBoosters.leagueId, leagueId),
        eq(activeBoosters.gameweek, gameweek),
        eq(activeBoosters.boosterType, "league_pulse")
      )
    );
  if (!access) {
    return res.status(403).json({ error: "Activate League Pulse for this gameweek first." });
  }

  const rows = await db
    .select({ team: picks.primaryTeam, pickCount: count() })
    .from(picks)
    .where(and(eq(picks.leagueId, leagueId), eq(picks.gameweek, gameweek)))
    .groupBy(picks.primaryTeam);

  const totalPicks = rows.reduce((sum, r) => sum + r.pickCount, 0);
  const breakdown = rows
    .map((r) => ({ team: r.team, count: r.pickCount, percent: totalPicks ? Math.round((r.pickCount / totalPicks) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  res.json({ leagueId, gameweek, totalPicks, breakdown });
});

// ---------------------------------------------------------------------------
// POST /api/shop/purchase — buy a featured item or booster with chips
// ---------------------------------------------------------------------------

shopRouter.post("/purchase", async (req, res) => {
  const userId = req.userId as string;
  const itemId = req.body?.itemId as string;
  const viaAds = Boolean(req.body?.viaAds);

  if (itemId === "draw_shield") {
    return res.status(400).json({
      error: "Draw Shield needs a league and gameweek — use POST /api/shop/draw-shield/activate instead.",
    });
  }
  if (itemId === "team_recall") {
    return res.status(400).json({
      error: "Team Recall needs a league, gameweek, and team — use POST /api/shop/team-recall/activate instead.",
    });
  }
  if (itemId === "league_pulse") {
    return res.status(400).json({
      error: "League Pulse needs a league and gameweek — use POST /api/shop/league-pulse/activate instead.",
    });
  }

  const item = SHOP_ITEMS[itemId];
  if (!item) return res.status(400).json({ error: `Unknown item: ${itemId}` });

  try {
    let balanceAfter: number;

    if (viaAds) {
      const earned = await consumeAdCredit(userId, itemId);
      if (!earned) {
        return res.status(400).json({ error: "You haven't watched enough ads for this yet." });
      }
      balanceAfter = await getChipBalance(userId); // unchanged — no chips spent
    } else {
      const result = await applyChipTransaction({
        userId,
        type: "shop_purchase",
        amount: -item.cost,
        note: `Purchased ${item.name}`,
      });
      balanceAfter = result.balanceAfter;
    }

    // TODO: this is where the item's actual effect gets applied — e.g.
    // "Streak Shield" needs to flag the relevant streak-tracking logic so
    // it doesn't reset on a loss. Each booster's effect lives in a
    // different part of the system, so this is intentionally left as a
    // per-item TODO rather than guessed at generically here.

    res.json({ purchased: item.name, balanceAfter, viaAds });
  } catch (err) {
    if (err instanceof InsufficientChipsError) {
      return res.status(400).json({ error: "Not enough chips for this item" });
    }
    throw err;
  }
});

// ---------------------------------------------------------------------------
// POST /api/shop/daily-reward/claim — once per 24h, checked against the
// chip ledger itself rather than a separate "last claimed" column
// ---------------------------------------------------------------------------

shopRouter.post("/daily-reward/claim", async (req, res) => {
  const userId = req.userId as string;

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recentClaim] = await db
    .select()
    .from(chipLedger)
    .where(
      and(
        eq(chipLedger.userId, userId),
        eq(chipLedger.type, "daily_reward"),
        gte(chipLedger.createdAt, twentyFourHoursAgo)
      )
    )
    .orderBy(desc(chipLedger.createdAt))
    .limit(1);

  if (recentClaim) {
    return res.status(400).json({ error: "Already claimed today's reward — come back tomorrow." });
  }

  const { balanceAfter } = await applyChipTransaction({
    userId,
    type: "daily_reward",
    amount: DAILY_REWARD_CHIPS,
    note: "Daily free reward",
  });

  res.json({ claimed: DAILY_REWARD_CHIPS, balanceAfter });
});

// ---------------------------------------------------------------------------
// GET /api/shop/balance — quick balance check, powers the header chip pill
// ---------------------------------------------------------------------------

shopRouter.get("/balance", async (req, res) => {
  // The session lookup that authenticated this request already read the
  // balance; only fall back to a second query if it didn't.
  const balance = req.chipBalanceAtAuth ?? await getChipBalance(req.userId as string);
  res.json({ balance });
});

// ---------------------------------------------------------------------------
// POST /api/shop/chip-packs/:packId/purchase — REAL MONEY, NOT IMPLEMENTED
// ---------------------------------------------------------------------------
//
// To actually build this, you need (in rough order):
//   1. A payment gateway account — Stripe is the natural fit for the web
//      launch (per your web-first decision); Apple/Google IAP only
//      matters once/if the native app ships.
//   2. A checkout flow: create a Stripe Checkout Session or PaymentIntent
//      server-side, redirect/present it client-side.
//   3. A webhook endpoint (NOT this route) that Stripe calls on payment
//      success — that webhook is what should call applyChipTransaction
//      with type: "chip_purchase". Never grant chips directly from the
//      client-facing purchase route, since that can be spoofed; only the
//      webhook (verified via Stripe's signature) should be trusted.
//   4. Handling for failed/disputed payments, refunds, and idempotency
//      (Stripe can retry webhook delivery — make sure double-delivery
//      doesn't double-grant chips).
// None of this exists yet. This route is a placeholder so the frontend
// has something to call and gets an honest "not ready" response instead
// of a 404.

shopRouter.post("/chip-packs/:packId/purchase", async (req, res) => {
  res.status(501).json({
    error: "Chip pack purchases aren't live yet — payment gateway integration pending.",
  });
});
