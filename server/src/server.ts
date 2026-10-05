import express from "express";
import cors from "cors";
import { max, sql } from "drizzle-orm";
import { db } from "@db/index";
import { footballCompetitions } from "@db/schema";
import "./types";
import { accountRouter } from "./routes/account";
import { chatRouter } from "./routes/chat";
import { friendsLeaguesRouter } from "./routes/friendsLeagues";
import { leaguesRouter } from "./routes/leagues";
import { picksRouter } from "./routes/picks";
import { shopRouter } from "./routes/shop";
import { splitVoteRouter } from "./routes/splitVote";
import { standingsRouter } from "./routes/standings";
import { attachUser } from "./middleware/auth";
import { authRouter } from "./routes/auth";
import { fixturesRouter } from "./routes/fixtures";
import { operationsRouter } from "./routes/operations";

export function createServer() {
  const app = express();

  const allowedOrigins = (process.env.APP_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed"));
    }
  }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/health/ready", async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
      const [{ lastFootballSyncAt }] = await db
        .select({ lastFootballSyncAt: max(footballCompetitions.lastSyncedAt) })
        .from(footballCompetitions);
      const maximumAgeMinutes = Math.max(5, Number(process.env.FOOTBALL_SYNC_MAX_AGE_MINUTES) || 30);
      const ageMinutes = lastFootballSyncAt
        ? Math.floor((Date.now() - lastFootballSyncAt.getTime()) / 60_000)
        : null;
      const footballDataFresh = ageMinutes !== null && ageMinutes <= maximumAgeMinutes;
      return res.status(footballDataFresh ? 200 : 503).json({
        ok: footballDataFresh,
        database: "ready",
        footballData: footballDataFresh ? "fresh" : "stale",
        lastFootballSyncAt,
        ageMinutes,
        maximumAgeMinutes,
        release: process.env.RENDER_GIT_COMMIT ?? process.env.RELEASE_VERSION ?? null,
      });
    } catch (error) {
      return res.status(503).json({
        ok: false,
        database: "unavailable",
        error: error instanceof Error ? error.message : "Readiness check failed",
      });
    }
  });
  app.use("/api/auth", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api/auth", authRouter);
  app.use("/api/fixtures", fixturesRouter);
  app.get("/api/session", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  }, attachUser, (req, res) => res.json({ user: req.authUser }));

  app.use("/api/account", attachUser, accountRouter);
  app.use("/api/friends-leagues", attachUser, friendsLeaguesRouter);
  app.use("/api/leagues", attachUser, chatRouter);
  app.use("/api/leagues", attachUser, splitVoteRouter);
  app.use("/api/leagues", attachUser, leaguesRouter);
  app.use("/api/picks", attachUser, picksRouter);
  app.use("/api/shop", attachUser, shopRouter);
  app.use("/api/split-vote", attachUser, splitVoteRouter);
  app.use("/api/standings", attachUser, standingsRouter);
  app.use("/api/operations", attachUser, operationsRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  });

  return app;
}
