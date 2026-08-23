import { and, eq } from "drizzle-orm";
import { db } from "@db/index";
import { footballCompetitions, footballFixtures, footballStandings } from "@db/schema";
import { FOOTBALL_COMPETITIONS, type FootballCompetitionKey } from "./footballCompetitions";
import {
  fetchFootballData,
  type ProviderMatchesResponse,
  type ProviderStandingsResponse,
} from "./footballData";

const INSERT_CHUNK_SIZE = 100;

export type FootballSyncMode = "fixtures" | "standings" | "full";

function seasonStartYear(startDate?: string) {
  if (!startDate) return null;
  const value = Number(startDate.slice(0, 4));
  return Number.isInteger(value) ? value : null;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function syncCompetition(key: FootballCompetitionKey, mode: FootballSyncMode) {
  const config = FOOTBALL_COMPETITIONS[key];
  const syncFixtures = mode !== "standings";
  const syncStandings = mode !== "fixtures";
  const matches = syncFixtures
    ? await fetchFootballData<ProviderMatchesResponse>(`/competitions/${config.providerCode}/matches`)
    : null;
  const standings = syncStandings
    ? await fetchFootballData<ProviderStandingsResponse>(`/competitions/${config.providerCode}/standings`)
    : null;
  const syncedAt = new Date();
  const firstMatchSeason = matches?.matches.find((match) => match.season?.startDate)?.season;
  const season = seasonStartYear(standings?.season.startDate) ?? seasonStartYear(firstMatchSeason?.startDate);
  const currentMatchday = standings?.season.currentMatchday ?? firstMatchSeason?.currentMatchday ?? null;
  const competitionName = matches?.competition.name ?? standings?.competition.name ?? config.label;
  const competitionEmblem = matches?.competition.emblem ?? standings?.competition.emblem ?? null;

  await db.transaction(async (tx) => {
    await tx
      .insert(footballCompetitions)
      .values({
        key,
        providerCode: config.providerCode,
        name: competitionName,
        emblem: competitionEmblem,
        seasonStartYear: season,
        currentMatchday,
        lastSyncedAt: syncedAt,
      })
      .onConflictDoUpdate({
        target: footballCompetitions.key,
        set: {
          providerCode: config.providerCode,
          name: competitionName,
          ...(competitionEmblem ? { emblem: competitionEmblem } : {}),
          ...(season !== null ? { seasonStartYear: season } : {}),
          ...(currentMatchday !== null ? { currentMatchday } : {}),
          lastSyncedAt: syncedAt,
        },
      });

    const fixtureRows = (matches?.matches ?? []).map((match) => ({
      providerId: match.id,
      competitionKey: key,
      seasonStartYear: seasonStartYear(match.season?.startDate) ?? season,
      matchday: match.matchday ?? null,
      stage: match.stage ?? null,
      group: match.group ?? null,
      utcDate: new Date(match.utcDate),
      status: match.status,
      venue: match.venue ?? null,
      homeTeamId: match.homeTeam.id,
      homeTeamName: match.homeTeam.name,
      homeTeamShortName: match.homeTeam.shortName ?? null,
      homeTeamCrest: match.homeTeam.crest ?? null,
      awayTeamId: match.awayTeam.id,
      awayTeamName: match.awayTeam.name,
      awayTeamShortName: match.awayTeam.shortName ?? null,
      awayTeamCrest: match.awayTeam.crest ?? null,
      winner: match.score.winner ?? null,
      homeScore: match.score.fullTime?.home ?? null,
      awayScore: match.score.fullTime?.away ?? null,
      providerUpdatedAt: match.lastUpdated ? new Date(match.lastUpdated) : null,
      syncedAt,
    }));

    if (syncFixtures) {
      await tx.delete(footballFixtures).where(eq(footballFixtures.competitionKey, key));
      for (const fixtureChunk of chunks(fixtureRows, INSERT_CHUNK_SIZE)) {
        if (fixtureChunk.length) await tx.insert(footballFixtures).values(fixtureChunk);
      }
    }

    if (syncStandings && standings && season !== null) {
      await tx
        .delete(footballStandings)
        .where(and(eq(footballStandings.competitionKey, key), eq(footballStandings.seasonStartYear, season)));

      const standingRows = standings.standings.flatMap((standing) =>
        standing.table.filter((row) => row.team.id !== null).map((row) => ({
          competitionKey: key,
          seasonStartYear: season,
          stage: standing.stage,
          type: standing.type,
          group: standing.group ?? null,
          position: row.position,
          teamId: row.team.id as number,
          teamName: row.team.name,
          teamShortName: row.team.shortName ?? null,
          teamCrest: row.team.crest ?? null,
          playedGames: row.playedGames,
          form: row.form ?? null,
          won: row.won,
          draw: row.draw,
          lost: row.lost,
          points: row.points,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalDifference,
          syncedAt,
        }))
      );

      for (const standingChunk of chunks(standingRows, INSERT_CHUNK_SIZE)) {
        if (standingChunk.length) await tx.insert(footballStandings).values(standingChunk);
      }
    }
  });

  return {
    key,
    competition: competitionName,
    fixtures: matches?.matches.length ?? null,
    standingRows: standings?.standings.reduce((count, item) => count + item.table.length, 0) ?? null,
    seasonStartYear: season,
    currentMatchday,
    syncedAt,
  };
}

export async function syncAllFootballData(mode: FootballSyncMode = "full") {
  const results = [];
  for (const key of Object.keys(FOOTBALL_COMPETITIONS) as FootballCompetitionKey[]) {
    results.push(await syncCompetition(key, mode));
  }
  return results;
}
