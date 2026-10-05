import { randomBytes } from "node:crypto";
import { Router } from "express";
import { eq, or } from "drizzle-orm";
import { db } from "@db/index";
import { authSessions, chipLedger, users } from "@db/schema";
import { loginSchema, signupSchema } from "@api-zod/knoxit-schemas";
import {
  clearSessionCookie,
  getSessionToken,
  hashSessionToken,
  requireAuth,
  setSessionCookie,
} from "../middleware/auth";
import { hashPassword, verifyPassword } from "../lib/password";
import { getBetaStartingChips } from "../lib/betaChips";

export const authRouter = Router();

const DEFAULT_SESSION_TTL_DAYS = 30;
const dummyPasswordHash = hashPassword(randomBytes(32).toString("base64url"));

function sessionTtlMs() {
  const configured = Number(process.env.SESSION_TTL_DAYS ?? DEFAULT_SESSION_TTL_DAYS);
  const days = Number.isFinite(configured) ? Math.min(Math.max(configured, 1), 90) : DEFAULT_SESSION_TTL_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await db.insert(authSessions).values({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt,
  });
  return { token, expiresAt };
}

function newSession() {
  return {
    token: randomBytes(32).toString("base64url"),
    expiresAt: new Date(Date.now() + sessionTtlMs()),
  };
}

async function createReferralCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `KX${randomBytes(5).toString("hex").toUpperCase()}`;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.referralCode, code)).limit(1);
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique referral code");
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

authRouter.post("/signup", async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Check your account details", details: parsed.error.flatten() });
    }

    const email = parsed.data.email;
    const username = parsed.data.username.toLowerCase();
    const [existing] = await db
      .select({ id: users.id, email: users.email, username: users.username })
      .from(users)
      .where(or(eq(users.email, email), eq(users.username, username)))
      .limit(1);

    if (existing) {
      return res.status(409).json({
        error: existing.email === email ? "An account already uses this email" : "That username is already taken",
      });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const referralCode = await createReferralCode();
    const startingChips = getBetaStartingChips();
    const session = newSession();

    // Account, beta wallet balance, auditable signup credit, and the first
    // session either all commit or all roll back. Database uniqueness on email
    // and username keeps concurrent/retried signup attempts to one account.
    const user = await db.transaction(async (tx) => {
      const [createdUser] = await tx
        .insert(users)
        .values({ email, passwordHash, username, referralCode, chipBalance: startingChips })
        .returning({
          id: users.id,
          email: users.email,
          username: users.username,
          isOperationsAdmin: users.isOperationsAdmin,
        });

      await tx.insert(chipLedger).values({
        userId: createdUser.id,
        type: "signup_bonus",
        amount: startingChips,
        balanceAfter: startingChips,
        note: "Closed beta starting allocation",
      });

      await tx.insert(authSessions).values({
        tokenHash: hashSessionToken(session.token),
        userId: createdUser.id,
        expiresAt: session.expiresAt,
      });

      return createdUser;
    });

    setSessionCookie(res, session.token, session.expiresAt);
    return res.status(201).json({ user, balance: startingChips });
  } catch (error) {
    if (isUniqueViolation(error)) return res.status(409).json({ error: "Email or username already exists" });
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password" });

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        isOperationsAdmin: users.isOperationsAdmin,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    // Always run scrypt so unknown emails do not have an obviously faster
    // response that can be used to enumerate registered accounts.
    const validPassword = await verifyPassword(
      parsed.data.password,
      user?.passwordHash ?? await dummyPasswordHash
    );
    if (!user || !validPassword) return res.status(401).json({ error: "Invalid email or password" });

    const session = await createSession(user.id);
    setSessionCookie(res, session.token, session.expiresAt);
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        isOperationsAdmin: user.isOperationsAdmin,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const token = getSessionToken(req);
    if (token) await db.delete(authSessions).where(eq(authSessions.tokenHash, hashSessionToken(token)));
    clearSessionCookie(res);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

authRouter.get("/session", requireAuth, (req, res) => {
  res.json({ user: req.authUser });
});
