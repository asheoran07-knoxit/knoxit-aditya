// artifacts/api-server/src/lib/chipLedger.ts
//
// Every chip balance change in Knoxit goes through this module. Never
// update users.chipBalance directly elsewhere — always call applyChipTransaction
// so the ledger stays the single source of truth and balances can always
// be audited/reconstructed from history.

import { db } from "@db/index"; // adjust to your actual db export path
import { users, chipLedger } from "@db/schema";
import { eq } from "drizzle-orm";
import { InsufficientChipsError } from "./chipErrors";

export { InsufficientChipsError } from "./chipErrors";

type ChipTransactionType =
  | "signup_bonus"
  | "daily_reward"
  | "league_entry"
  | "split_payout"
  | "vault_payout"
  | "chip_purchase"
  | "shop_purchase"
  | "referral_bonus"
  | "admin_adjustment"
  | "admin_credit"
  | "admin_refund"
  | "admin_correction";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ChipTransactionParams = {
  userId: string;
  leagueId?: string | null;
  type: ChipTransactionType;
  amount: number;
  vaultAmount?: number;
  note?: string;
  reference?: string | null;
  actorUserId?: string | null;
  idempotencyKey?: string | null;
};

/**
 * Applies a chip transaction atomically: updates the user's balance and
 * writes a ledger row in the same DB transaction. Positive `amount` credits,
 * negative `amount` debits.
 *
 * Throws InsufficientChipsError if a debit would take the balance below zero.
 */
export async function applyChipTransaction(params: ChipTransactionParams) {
  return db.transaction((tx) => applyChipTransactionInTransaction(tx, params));
}

/**
 * Transaction-aware variant for workflows (such as league joining) that
 * need the balance, ledger, membership and vault changes to commit together.
 */
export async function applyChipTransactionInTransaction(
  tx: DbTransaction,
  params: ChipTransactionParams
) {
  const {
    userId,
    leagueId = null,
    type,
    amount,
    vaultAmount = 0,
    note,
    reference = null,
    actorUserId = null,
    idempotencyKey = null,
  } = params;

  const [user] = await tx
    .select({ chipBalance: users.chipBalance })
    .from(users)
    .where(eq(users.id, userId))
    .for("update"); // row lock to prevent race conditions on concurrent spends

  if (!user) throw new Error(`User ${userId} not found`);

  const newBalance = user.chipBalance + amount;
  if (newBalance < 0) {
    throw new InsufficientChipsError(user.chipBalance, Math.abs(amount));
  }

  await tx.update(users).set({ chipBalance: newBalance }).where(eq(users.id, userId));

  const [ledgerRow] = await tx
    .insert(chipLedger)
    .values({
      userId,
      leagueId,
      type,
      amount,
      balanceAfter: newBalance,
      vaultAmount,
      note: note ?? null,
      reference,
      actorUserId,
      idempotencyKey,
    })
    .returning();

  return { balanceAfter: newBalance, ledgerRow };
}

export async function getChipBalance(userId: string): Promise<number> {
  const [user] = await db
    .select({ chipBalance: users.chipBalance })
    .from(users)
    .where(eq(users.id, userId));
  return user?.chipBalance ?? 0;
}
