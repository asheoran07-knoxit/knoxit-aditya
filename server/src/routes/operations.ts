import { Router } from "express";
import { and, asc, count, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@db/index";
import {
  chipLedger,
  footballCompetitions,
  leagueMembers,
  leagues,
  operationsAuditLog,
  users,
} from "@db/schema";
import { applyChipTransactionInTransaction } from "../lib/chipLedger";
import { InsufficientChipsError } from "../lib/chipErrors";
import { requireOperationsAdmin } from "../middleware/auth";

export const operationsRouter = Router();
operationsRouter.use(requireOperationsAdmin);

const idempotencyKey = z.string().uuid();
const feeUpdateSchema = z.object({
  entryFeeChips: z.number().int().min(0).max(1_000_000),
  reason: z.string().trim().min(8).max(500),
  idempotencyKey,
});
const adjustmentSchema = z.object({
  kind: z.enum(["credit", "refund", "correction"]),
  userId: z.string().uuid(),
  leagueId: z.string().uuid().optional(),
  amount: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
  vaultAmount: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  reference: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(8).max(500),
  idempotencyKey,
}).superRefine((input, context) => {
  if ((input.kind === "credit" || input.kind === "refund") && input.amount <= 0) {
    context.addIssue({ code: "custom", path: ["amount"], message: "Credits and refunds must increase the user's balance" });
  }
  if (input.kind === "credit" && input.vaultAmount !== 0) {
    context.addIssue({ code: "custom", path: ["vaultAmount"], message: "A standalone credit cannot change a vault" });
  }
  if (input.kind === "refund" && (!input.leagueId || input.vaultAmount !== -input.amount)) {
    context.addIssue({ code: "custom", path: ["vaultAmount"], message: "A refund must debit the selected vault by the credited amount" });
  }
  if (input.vaultAmount !== 0 && !input.leagueId) {
    context.addIssue({ code: "custom", path: ["leagueId"], message: "A league is required for a vault correction" });
  }
});

const ledgerTypes = [
  "signup_bonus", "daily_reward", "league_entry", "split_payout", "vault_payout",
  "chip_purchase", "shop_purchase", "referral_bonus", "admin_adjustment",
  "admin_credit", "admin_refund", "admin_correction",
] as const;

function ledgerFilters(query: Record<string, unknown>) {
  const conditions: SQL[] = [];
  if (typeof query.userId === "string") {
    if (!z.string().uuid().safeParse(query.userId).success) throw new OperationsError(400, "userId must be a UUID");
    conditions.push(eq(chipLedger.userId, query.userId));
  }
  if (typeof query.leagueId === "string") {
    if (!z.string().uuid().safeParse(query.leagueId).success) throw new OperationsError(400, "leagueId must be a UUID");
    conditions.push(eq(chipLedger.leagueId, query.leagueId));
  }
  if (typeof query.type === "string" && ledgerTypes.includes(query.type as typeof ledgerTypes[number])) {
    conditions.push(eq(chipLedger.type, query.type as typeof ledgerTypes[number]));
  }
  if (typeof query.reference === "string" && query.reference.trim()) {
    conditions.push(ilike(chipLedger.reference, `%${query.reference.trim()}%`));
  }
  if (typeof query.from === "string") {
    const from = new Date(query.from);
    if (Number.isNaN(from.getTime())) throw new OperationsError(400, "from must be a valid date");
    conditions.push(gte(chipLedger.createdAt, from));
  }
  if (typeof query.to === "string") {
    const to = new Date(query.to);
    if (Number.isNaN(to.getTime())) throw new OperationsError(400, "to must be a valid date");
    conditions.push(lte(chipLedger.createdAt, to));
  }
  return conditions;
}

operationsRouter.get("/summary", async (_req, res) => {
  const [competitions, leagueRows, ledgerTotals] = await Promise.all([
    db.select({
      key: footballCompetitions.key,
      name: footballCompetitions.name,
      entryFeeChips: footballCompetitions.competitiveEntryFeeChips,
      enabled: footballCompetitions.competitiveEnabled,
      lastSyncedAt: footballCompetitions.lastSyncedAt,
    }).from(footballCompetitions).orderBy(asc(footballCompetitions.name)),
    db.select({
      id: leagues.id,
      code: leagues.code,
      name: leagues.name,
      status: leagues.status,
      entryFeeChips: leagues.entryFeeChips,
      vaultChips: leagues.vaultChips,
      memberCount: count(leagueMembers.userId),
    }).from(leagues)
      .leftJoin(leagueMembers, eq(leagueMembers.leagueId, leagues.id))
      .where(eq(leagues.type, "competitive"))
      .groupBy(leagues.id)
      .orderBy(desc(leagues.createdAt))
      .limit(100),
    db.select({
      leagueId: chipLedger.leagueId,
      entryPayments: sql<number>`coalesce(-sum(case when ${chipLedger.type} = 'league_entry' then ${chipLedger.amount} else 0 end), 0)`,
      refunds: sql<number>`coalesce(sum(case when ${chipLedger.type} = 'admin_refund' then ${chipLedger.amount} else 0 end), 0)`,
      payouts: sql<number>`coalesce(sum(case when ${chipLedger.type} in ('vault_payout', 'split_payout') then ${chipLedger.amount} else 0 end), 0)`,
      ledgerVault: sql<number>`coalesce(sum(${chipLedger.vaultAmount}), 0)`,
    }).from(chipLedger).where(sql`${chipLedger.leagueId} is not null`).groupBy(chipLedger.leagueId),
  ]);

  const totals = new Map(ledgerTotals.map((row) => [row.leagueId, row]));
  res.json({
    competitions,
    leagues: leagueRows.map((league) => ({
      ...league,
      entryPayments: Number(totals.get(league.id)?.entryPayments ?? 0),
      refunds: Number(totals.get(league.id)?.refunds ?? 0),
      payouts: Number(totals.get(league.id)?.payouts ?? 0),
      reconciled: league.vaultChips === Number(totals.get(league.id)?.ledgerVault ?? 0),
    })),
  });
});

operationsRouter.get("/ledger", async (req, res) => {
  const conditions = ledgerFilters(req.query);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: chipLedger.id,
      userId: chipLedger.userId,
      username: users.username,
      leagueId: chipLedger.leagueId,
      leagueCode: leagues.code,
      type: chipLedger.type,
      amount: chipLedger.amount,
      balanceAfter: chipLedger.balanceAfter,
      vaultAmount: chipLedger.vaultAmount,
      reference: chipLedger.reference,
      note: chipLedger.note,
      actorUserId: chipLedger.actorUserId,
      createdAt: chipLedger.createdAt,
    }).from(chipLedger)
      .innerJoin(users, eq(users.id, chipLedger.userId))
      .leftJoin(leagues, eq(leagues.id, chipLedger.leagueId))
      .where(where)
      .orderBy(desc(chipLedger.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(chipLedger).where(where),
  ]);
  res.json({ rows, page, pageSize, total });
});

operationsRouter.get("/ledger.csv", async (req, res) => {
  const conditions = ledgerFilters(req.query);
  const rows = await db.select({
    id: chipLedger.id,
    createdAt: chipLedger.createdAt,
    userId: chipLedger.userId,
    leagueId: chipLedger.leagueId,
    type: chipLedger.type,
    amount: chipLedger.amount,
    balanceAfter: chipLedger.balanceAfter,
    vaultAmount: chipLedger.vaultAmount,
    reference: chipLedger.reference,
    note: chipLedger.note,
    actorUserId: chipLedger.actorUserId,
  }).from(chipLedger)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(chipLedger.createdAt))
    .limit(10_000);
  const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const fields = ["id", "createdAt", "userId", "leagueId", "type", "amount", "balanceAfter", "vaultAmount", "reference", "note", "actorUserId"] as const;
  const csv = [fields.join(","), ...rows.map((row) => fields.map((field) => csvCell(row[field])).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=knoxit-chip-ledger.csv");
  res.send(csv);
});

operationsRouter.get("/audit", async (_req, res) => {
  const rows = await db.select().from(operationsAuditLog).orderBy(desc(operationsAuditLog.createdAt)).limit(200);
  res.json(rows);
});

operationsRouter.patch("/competitions/:key/entry-fee", async (req, res) => {
  const parsed = feeUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid fee update", details: parsed.error.flatten() });
  const actorUserId = req.userId as string;
  const competitionKey = req.params.key;

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ops:${parsed.data.idempotencyKey}`}))`);
    const [replayed] = await tx.select().from(operationsAuditLog)
      .where(eq(operationsAuditLog.idempotencyKey, parsed.data.idempotencyKey)).limit(1);
    if (replayed) {
      if (replayed.action !== "COMPETITION_ENTRY_FEE_UPDATED" || replayed.entityId !== competitionKey) {
        throw new OperationsError(409, "Idempotency key has already been used for another operation");
      }
      return { replayed: true, audit: replayed };
    }

    const [competition] = await tx.select().from(footballCompetitions)
      .where(eq(footballCompetitions.key, competitionKey)).for("update").limit(1);
    if (!competition) return null;
    await tx.update(footballCompetitions)
      .set({ competitiveEntryFeeChips: parsed.data.entryFeeChips })
      .where(eq(footballCompetitions.key, competitionKey));
    const [audit] = await tx.insert(operationsAuditLog).values({
      actorUserId,
      action: "COMPETITION_ENTRY_FEE_UPDATED",
      entityType: "football_competition",
      entityId: competitionKey,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
      details: { before: competition.competitiveEntryFeeChips, after: parsed.data.entryFeeChips },
    }).returning();
    return { replayed: false, audit };
  });
  if (!result) return res.status(404).json({ error: "Competition not found" });
  res.status(result.replayed ? 200 : 201).json(result);
});

operationsRouter.post("/adjustments", async (req, res) => {
  const parsed = adjustmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid adjustment", details: parsed.error.flatten() });
  const actorUserId = req.userId as string;
  const input = parsed.data;

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ops:${input.idempotencyKey}`}))`);
    const [existingAudit] = await tx.select().from(operationsAuditLog)
      .where(eq(operationsAuditLog.idempotencyKey, input.idempotencyKey)).limit(1);
    const [existing] = await tx.select().from(chipLedger)
      .where(eq(chipLedger.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existingAudit || existing) {
      if (existingAudit?.action !== `CHIP_${input.kind.toUpperCase()}` || !existing) {
        throw new OperationsError(409, "Idempotency key has already been used for another operation");
      }
      return { replayed: true, ledger: existing };
    }

    let league: typeof leagues.$inferSelect | undefined;
    if (input.leagueId) {
      [league] = await tx.select().from(leagues).where(eq(leagues.id, input.leagueId)).for("update").limit(1);
      if (!league) throw new OperationsError(404, "League not found");
      if (league.vaultChips + input.vaultAmount < 0) throw new OperationsError(409, "Adjustment would make the vault negative");
    }
    if (input.kind === "refund" && input.leagueId) {
      const [{ paid, refunded }] = await tx.select({
        paid: sql<number>`coalesce(-sum(case when ${chipLedger.type} = 'league_entry' then ${chipLedger.amount} else 0 end), 0)`,
        refunded: sql<number>`coalesce(sum(case when ${chipLedger.type} = 'admin_refund' then ${chipLedger.amount} else 0 end), 0)`,
      }).from(chipLedger).where(and(
        eq(chipLedger.userId, input.userId),
        eq(chipLedger.leagueId, input.leagueId)
      ));
      if (input.amount > Number(paid) - Number(refunded)) {
        throw new OperationsError(409, "Refund exceeds the user's unreimbursed entry payments for this league");
      }
    }

    const type = input.kind === "credit" ? "admin_credit"
      : input.kind === "refund" ? "admin_refund"
        : "admin_correction";
    const chipResult = await applyChipTransactionInTransaction(tx, {
      userId: input.userId,
      leagueId: input.leagueId,
      type,
      amount: input.amount,
      vaultAmount: input.vaultAmount,
      note: input.reason,
      reference: input.reference,
      actorUserId,
      idempotencyKey: input.idempotencyKey,
    });
    if (league && input.vaultAmount !== 0) {
      await tx.update(leagues)
        .set({ vaultChips: league.vaultChips + input.vaultAmount })
        .where(eq(leagues.id, league.id));
    }
    await tx.insert(operationsAuditLog).values({
      actorUserId,
      action: `CHIP_${input.kind.toUpperCase()}`,
      entityType: "user",
      entityId: input.userId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      details: {
        amount: input.amount,
        balanceAfter: chipResult.balanceAfter,
        leagueId: input.leagueId ?? null,
        vaultAmount: input.vaultAmount,
        vaultAfter: league ? league.vaultChips + input.vaultAmount : null,
        reference: input.reference,
      },
    });
    return { replayed: false, ledger: chipResult.ledgerRow };
  });
  res.status(result.replayed ? 200 : 201).json(result);
});

class OperationsError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

operationsRouter.use((error: unknown, _req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }, next: (error: unknown) => void) => {
  if (error instanceof OperationsError) return res.status(error.status).json({ error: error.message });
  if (error instanceof InsufficientChipsError) return res.status(409).json({ error: error.message });
  next(error);
});
