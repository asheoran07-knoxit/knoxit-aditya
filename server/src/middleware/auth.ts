import { createHash } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@db/index";
import { authSessions, users } from "@db/schema";

export const SESSION_COOKIE = "knoxit_session";

function cookieAttributes() {
  const sameSite = process.env.COOKIE_SAME_SITE?.toLowerCase() === "none" ? "None" : "Lax";
  const secure = process.env.NODE_ENV === "production" || sameSite === "None";
  return `HttpOnly; Path=/; SameSite=${sameSite}${secure ? "; Secure" : ""}`;
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readCookie(req: Request, name: string) {
  const header = req.header("cookie");
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }

  return undefined;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes()}; Max-Age=${maxAge}; Expires=${expiresAt.toUTCString()}`
  );
}

export function clearSessionCookie(res: Response) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; ${cookieAttributes()}; Max-Age=0`
  );
}

export function getSessionToken(req: Request) {
  return readCookie(req, SESSION_COOKIE);
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = getSessionToken(req);
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const tokenHash = hashSessionToken(token);
    const [session] = await db
      .select({
        userId: users.id,
        email: users.email,
        username: users.username,
        isOperationsAdmin: users.isOperationsAdmin,
        lastUsedAt: authSessions.lastUsedAt,
      })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, new Date())))
      .limit(1);

    if (!session) {
      clearSessionCookie(res);
      return res.status(401).json({ error: "Session expired" });
    }

    req.userId = session.userId;
    req.authUser = {
      id: session.userId,
      email: session.email,
      username: session.username,
      isOperationsAdmin: session.isOperationsAdmin,
    };

    if (session.lastUsedAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      void db
        .update(authSessions)
        .set({ lastUsedAt: new Date() })
        .where(eq(authSessions.tokenHash, tokenHash))
        .catch(() => undefined);
    }
    next();
  } catch (error) {
    next(error);
  }
};

// Kept as an alias so existing feature routers do not need a noisy rename.
export const attachUser = requireAuth;

export const requireOperationsAdmin: RequestHandler = (req, res, next) => {
  if (process.env.OPERATIONS_ENABLED === "false") {
    return res.status(503).json({ error: "Operations portal is temporarily disabled" });
  }
  if (!req.authUser?.isOperationsAdmin) {
    return res.status(403).json({ error: "Operations administrator access required" });
  }
  next();
};
