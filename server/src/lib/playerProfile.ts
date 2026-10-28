// What one league member can see about another on the player profile.

export type ProfilePickInput = {
  gameweek: number;
  primaryTeam: string;
  backupTeam: string | null;
  usedBackup: boolean;
  result: "pending" | "survived" | "eliminated";
};

export type ProfilePick = {
  gameweek: number;
  hidden: boolean;
  primaryTeam: string | null;
  backupTeam: string | null;
  usedBackup: boolean;
  result: "pending" | "survived" | "eliminated" | "no_pick";
};

/**
 * A pick is revealed only once its gameweek has locked. The league's current
 * gameweek is unlocked while `locksAt` is still in the future; every earlier
 * gameweek has locked already.
 */
export function isPickHidden(gameweek: number, league: { currentGameweek: number; locksAt: Date | null }, now = new Date()) {
  if (gameweek < league.currentGameweek) return false;
  return league.locksAt === null || league.locksAt > now;
}

export function buildPlayerProfile(params: {
  picks: ProfilePickInput[];
  league: { currentGameweek: number; locksAt: Date | null };
  knockedOutAtGameweek: number | null;
  knockoutReason: string | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const picks: ProfilePick[] = [...params.picks]
    .sort((left, right) => right.gameweek - left.gameweek)
    .map((pick) => {
      const hidden = isPickHidden(pick.gameweek, params.league, now);
      return {
        gameweek: pick.gameweek,
        hidden,
        primaryTeam: hidden ? null : pick.primaryTeam,
        backupTeam: hidden ? null : pick.backupTeam,
        usedBackup: hidden ? false : pick.usedBackup,
        result: hidden ? "pending" : pick.result,
      };
    });

  // Knocked out for not picking: show that gameweek as a row of its own.
  if (
    params.knockoutReason === "NO_PICK_SUBMITTED"
    && params.knockedOutAtGameweek !== null
    && !picks.some((pick) => pick.gameweek === params.knockedOutAtGameweek)
  ) {
    picks.push({ gameweek: params.knockedOutAtGameweek, hidden: false, primaryTeam: null, backupTeam: null, usedBackup: false, result: "no_pick" });
    picks.sort((left, right) => right.gameweek - left.gameweek);
  }

  const resolved = picks.filter((pick) => pick.result === "survived" || pick.result === "eliminated" || pick.result === "no_pick");
  const gameweeksSurvived = resolved.filter((pick) => pick.result === "survived").length;
  let currentStreak = 0;
  for (const pick of resolved) {
    if (pick.result !== "survived") break;
    currentStreak += 1;
  }

  return {
    picks,
    stats: {
      currentStreak,
      gameweeksSurvived,
      gameweeksPlayed: resolved.length,
      survivalRate: resolved.length ? Math.round((gameweeksSurvived / resolved.length) * 100) : null,
    },
  };
}
