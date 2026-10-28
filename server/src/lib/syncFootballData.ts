import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@db/index";
import { footballCompetitions, footballFixtures, footballStandings, predictions } from "@db/schema";
import { FOOTBALL_COMPETITIONS, type FootballCompetitionKey } from "./footballCompetitions";
import {
  fetchFootballData,
  type ProviderMatchesResponse,
  type ProviderStandingsResponse,
} from "./footballData";

const INSERT_CHUNK_SIZE = 100;

// Every provider-supplied column is refreshed on upsert.
const FIXTURE_UPSERT_SET = {
  competitionKey: sql`excluded.competition_key`,
  seasonStartYear: sql`excluded.season_start_year`,
  matchday: sql`excluded.matchday`,
  stage: sql`excluded.stage`,
  group: sql`excluded.group_name`,
  utcDate: sql`excluded.utc_date`,
  status: sql`excluded.status`,
  venue: sql`excluded.venue`,
  homeTeamId: sql`excluded.home_team_id`,
  homeTeamName: sql`excluded.home_team_name`,
  homeTeamShortName: sql`excluded.home_team_short_name`,
  homeTeamCrest: sql`excluded.home_team_crest`,
  awayTeamId: sql`excluded.away_team_id`,
  awayTeamName: sql`excluded.away_team_name`,
  awayTeamShortName: sql`excluded.away_team_short_name`,
  awayTeamCrest: sql`excluded.away_team_crest`,
  winner: sql`excluded.winner`,
  homeScore: sql`excluded.home_score`,
  awayScore: sql`excluded.away_score`,
  providerUpdatedAt: sql`excluded.provider_updated_at`,
  syncedAt: sql`excluded.synced_at`,
};

/** Postgres foreign_key_violation (23503), possibly wrapped by the driver. */
export function isForeignKeyViolation(error: unknown): boolean {
  const code = (value: unknown) => (typeof value === "object" && value !== null ? (value as { code?: unknown }).code : undefined);
  return code(error) === "23503" || code((error as { cause?: unknown } | null)?.cause) === "23503";
}

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
  // Knoxit's own display name, not the provider's (football-data.org calls
  // La Liga "Primera Division"). League names are built from this too.
  const competitionName = config.label;
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
      // Update fixtures in place rather than delete-and-reinsert: other rows
      // (e.g. predictions) reference fixtures by provider id, and a blanket
      // delete would fail the whole sync once any such row exists.
      for (const fixtureChunk of chunks(fixtureRows, INSERT_CHUNK_SIZE)) {
        if (!fixtureChunk.length) continue;
        await tx
          .insert(footballFixtures)
          .values(fixtureChunk)
          .onConflictDoUpdate({ target: footballFixtures.providerId, set: FIXTURE_UPSERT_SET });
      }
      // Drop fixtures the provider no longer lists, never one a prediction
      // uses. If anything else still references one, keep them all this time
      // (savepoint) instead of failing the sync.
      const currentIds = fixtureRows.map((row) => row.providerId);
      try {
        await tx.transaction(async (savepoint) => {
          await savepoint.delete(footballFixtures).where(and(
            eq(footballFixtures.competitionKey, key),
            currentIds.length ? notInArray(footballFixtures.providerId, currentIds) : undefined,
            notInArray(footballFixtures.providerId, savepoint.select({ id: predictions.fixtureId }).from(predictions))
          ));
        });
      } catch (error) {
        if (!isForeignKeyViolation(error)) throw error;
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
