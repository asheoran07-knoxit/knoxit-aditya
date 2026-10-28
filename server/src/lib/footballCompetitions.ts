export const FOOTBALL_COMPETITIONS = {
  epl: { providerCode: "PL", label: "Premier League", shortLabel: "EPL" },
  la_liga: { providerCode: "PD", label: "La Liga", shortLabel: "La Liga" },
  bundesliga: { providerCode: "BL1", label: "Bundesliga", shortLabel: "Bundesliga" },
  serie_a: { providerCode: "SA", label: "Serie A", shortLabel: "Serie A" },
  ucl: { providerCode: "CL", label: "UEFA Champions League", shortLabel: "UCL" },
} as const;

export type FootballCompetitionKey = keyof typeof FOOTBALL_COMPETITIONS;

export function isFootballCompetitionKey(value: string): value is FootballCompetitionKey {
  return value in FOOTBALL_COMPETITIONS;
}

// Display order everywhere: the order of FOOTBALL_COMPETITIONS above
// (Premier League first). Unknown keys sort last.
const COMPETITION_ORDER = Object.keys(FOOTBALL_COMPETITIONS);

export function compareCompetitionOrder(left: string, right: string) {
  const rank = (key: string) => {
    const index = COMPETITION_ORDER.indexOf(key);
    return index === -1 ? COMPETITION_ORDER.length : index;
  };
  return rank(left) - rank(right);
}
