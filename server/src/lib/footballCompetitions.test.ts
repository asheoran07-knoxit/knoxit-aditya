import { describe, expect, it } from "vitest";
import { compareCompetitionOrder, FOOTBALL_COMPETITIONS } from "./footballCompetitions";

describe("competition display order", () => {
  it("puts Premier League first, then La Liga, Bundesliga, Serie A, Champions League", () => {
    const alphabetical = ["bundesliga", "epl", "la_liga", "serie_a", "ucl"];
    expect([...alphabetical].sort(compareCompetitionOrder)).toEqual(["epl", "la_liga", "bundesliga", "serie_a", "ucl"]);
  });

  it("sorts unknown competitions last", () => {
    expect(["mls", "ucl", "epl"].sort(compareCompetitionOrder)).toEqual(["epl", "ucl", "mls"]);
  });

  it("uses Knoxit's display names", () => {
    expect(FOOTBALL_COMPETITIONS.la_liga.label).toBe("La Liga");
  });
});
