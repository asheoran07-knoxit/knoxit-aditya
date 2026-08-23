import { createHash, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { and, asc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { db } from "@db/index";
import { footballCompetitions, footballFixtures } from "@db/schema";
import { FOOTBALL_COMPETITIONS, isFootballCompetitionKey } from "../lib/footballCompetitions";
import { FootballDataError } from "../lib/footballData";
import { FootballSyncInProgressError, getFootballSyncStatus, runFootballSync } from "../lib/footballSyncRunner";
import type { FootballSyncMode } from "../lib/syncFootballData";
import { requireAuth } from "../middleware/auth";

export const fixturesRouter = Router();

function validSyncSecret(provided?: string) {
  const expected = process.env.FOOTBALL_DATA_SYNC_SECRET;
  if (!expected || !provided) return false;
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

fixturesRouter.post("/sync", async (req, res, next) => {
  if (!validSyncSecret(req.header("x-sync-secret"))) {
    return res.status(401).json({ error: "Invalid sync credentials" });
  }

  const mode = (req.query.mode ?? "full") as FootballSyncMode;
  if (!(["fixtures", "standings", "full"] as string[]).includes(mode)) {
    return res.status(400).json({ error: "mode must be fixtures, standings, or full" });
  }

  try {
    const results = await runFootballSync("api", mode);
    res.json({ synced: true, mode, competitions: results });
  } catch (error) {
    if (error instanceof FootballSyncInProgressError) {
      return res.status(409).json({ error: error.message, active: error.active });
    }
    if (error instanceof FootballDataError) {
      return res.status(error.status === 429 ? 429 : 502).json({
        error: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    next(error);
  }
});

fixturesRouter.get("/sync/status", (req, res) => {
  if (!validSyncSecret(req.header("x-sync-secret"))) {
    return res.status(401).json({ error: "Invalid sync credentials" });
  }
  res.json(getFootballSyncStatus());
});

fixturesRouter.use(requireAuth);

fixturesRouter.get("/competitions", async (_req, res) => {
  const cached = await db.select().from(footballCompetitions).orderBy(asc(footballCompetitions.name));
  const byKey = new Map(cached.map((competition) => [competition.key, competition]));

  res.json(
    Object.entries(FOOTBALL_COMPETITIONS).map(([key, config]) => ({
      key,
      providerCode: config.providerCode,
      name: byKey.get(key)?.name ?? config.label,
      shortLabel: config.shortLabel,
      emblem: byKey.get(key)?.emblem ?? null,
      seasonStartYear: byKey.get(key)?.seasonStartYear ?? null,
      currentMatchday: byKey.get(key)?.currentMatchday ?? null,
      lastSyncedAt: byKey.get(key)?.lastSyncedAt ?? null,
    }))
  );
});

fixturesRouter.get("/", async (req, res) => {
  const requestedLeagues = typeof req.query.league === "string"
    ? req.query.league.split(",").map((value) => value.trim()).filter(Boolean)
    : [];
  const invalidLeague = requestedLeagues.find((key) => !isFootballCompetitionKey(key));
  if (invalidLeague) return res.status(400).json({ error: `Unknown league key: ${invalidLeague}` });

  const matchday = req.query.matchday === undefined ? undefined : Number(req.query.matchday);
  if (matchday !== undefined && (!Number.isInteger(matchday) || matchday < 1)) {
    return res.status(400).json({ error: "matchday must be a positive integer" });
  }

  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(`${req.query.dateFrom}T00:00:00.000Z`) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(`${req.query.dateTo}T23:59:59.999Z`) : undefined;
  if (dateFrom && Number.isNaN(dateFrom.getTime())) return res.status(400).json({ error: "dateFrom must be YYYY-MM-DD" });
  if (dateTo && Number.isNaN(dateTo.getTime())) return res.status(400).json({ error: "dateTo must be YYYY-MM-DD" });

  const conditions: SQL[] = [];
  if (requestedLeagues.length === 1) conditions.push(eq(footballFixtures.competitionKey, requestedLeagues[0]));
  if (requestedLeagues.length > 1) conditions.push(inArray(footballFixtures.competitionKey, requestedLeagues));
  if (matchday !== undefined) conditions.push(eq(footballFixtures.matchday, matchday));
  if (dateFrom) conditions.push(gte(footballFixtures.utcDate, dateFrom));
  if (dateTo) conditions.push(lte(footballFixtures.utcDate, dateTo));

  const rows = await db
    .select()
    .from(footballFixtures)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(footballFixtures.utcDate));

  const competitions = await db
    .select()
    .from(footballCompetitions)
    .where(requestedLeagues.length ? inArray(footballCompetitions.key, requestedLeagues) : undefined);

  res.json({ competitions, fixtures: rows });
});
