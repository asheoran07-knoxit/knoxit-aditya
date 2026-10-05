import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Download, ShieldCheck } from "lucide-react";
import { SubHeader } from "../components/Header";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Field, TextArea } from "../components/ui/Form";
import { useAppSelector } from "../app/hooks";
import {
  useCreateOperationsAdjustmentMutation,
  useGetOperationsAuditQuery,
  useGetOperationsLedgerQuery,
  useGetOperationsSummaryQuery,
  useUpdateCompetitionEntryFeeMutation,
  type OperationsSummary,
} from "../services/api/knoxitApi";

function apiError(error: unknown) {
  if (typeof error === "object" && error && "data" in error) {
    const data = (error as { data?: { error?: string } }).data;
    if (data?.error) return data.error;
  }
  return "The operation could not be completed.";
}

function FeeEditor({ competition }: { competition: OperationsSummary["competitions"][number] }) {
  const [fee, setFee] = useState(String(competition.entryFeeChips));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [updateFee, updateState] = useUpdateCompetitionEntryFeeMutation();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    try {
      await updateFee({
        key: competition.key,
        entryFeeChips: Number(fee),
        reason,
        idempotencyKey: crypto.randomUUID(),
      }).unwrap();
      setMessage("Future-cohort fee updated. Existing cohorts were not changed.");
      setReason("");
    } catch (error) {
      setMessage(apiError(error));
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3 md:grid-cols-[1fr_140px_2fr_auto] md:items-end">
      <div>
        <div className="font-semibold text-white">{competition.name}</div>
        <div className="text-[11px] text-zinc-500">{competition.key} · future cohorts only</div>
      </div>
      <Field label="Entry fee" type="number" min="0" value={fee} onChange={(event) => setFee(event.target.value)} required />
      <Field label="Reason" value={reason} minLength={8} maxLength={500} onChange={(event) => setReason(event.target.value)} required />
      <Button type="submit" loading={updateState.isLoading}>Update</Button>
      {message ? <div className="text-xs text-zinc-300 md:col-span-4">{message}</div> : null}
    </form>
  );
}

export default function Operations() {
  const [, setLocation] = useLocation();
  const user = useAppSelector((state) => state.auth.user);
  const summary = useGetOperationsSummaryQuery(undefined, { skip: !user?.isOperationsAdmin });
  const [ledgerQuery, setLedgerQuery] = useState("");
  const ledger = useGetOperationsLedgerQuery(ledgerQuery, { skip: !user?.isOperationsAdmin });
  const audit = useGetOperationsAuditQuery(undefined, { skip: !user?.isOperationsAdmin });
  const [adjust, adjustState] = useCreateOperationsAdjustmentMutation();
  const [kind, setKind] = useState<"credit" | "refund" | "correction">("credit");
  const [userId, setUserId] = useState("");
  const [leagueId, setLeagueId] = useState("");
  const [amount, setAmount] = useState("");
  const [vaultAmount, setVaultAmount] = useState("0");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [ledgerUserId, setLedgerUserId] = useState("");
  const [ledgerLeagueId, setLedgerLeagueId] = useState("");
  const [ledgerType, setLedgerType] = useState("");
  const [ledgerReference, setLedgerReference] = useState("");
  const [ledgerFrom, setLedgerFrom] = useState("");
  const [ledgerTo, setLedgerTo] = useState("");

  if (!user?.isOperationsAdmin) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <ShieldCheck className="text-red-300" />
        <h1 className="text-lg font-bold text-white">Operations access required</h1>
        <p className="text-sm text-zinc-400">League administrator permissions do not grant platform operations access.</p>
        <Button variant="secondary" onClick={() => setLocation("/")}>Return home</Button>
      </div>
    );
  }

  const submitAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    try {
      await adjust({
        kind,
        userId,
        leagueId: leagueId || undefined,
        amount: Number(amount),
        vaultAmount: Number(vaultAmount),
        reference,
        reason,
        idempotencyKey: crypto.randomUUID(),
      }).unwrap();
      setMessage("Adjustment committed and added to the immutable audit trail.");
      setAmount("");
      setReference("");
      setReason("");
    } catch (error) {
      setMessage(apiError(error));
    }
  };

  return (
    <>
      <SubHeader title="Operations" onBack={() => window.history.back()} />
      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-8">
        <section>
          <h2 className="mb-2 text-sm font-bold text-white">Future cohort entry fees</h2>
          <div className="space-y-2">
            {summary.data?.competitions.map((competition) => <FeeEditor key={competition.key} competition={competition} />)}
          </div>
        </section>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-bold text-white">Reason-coded balance adjustment</h2>
          <form onSubmit={submitAdjustment} className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-zinc-300">Type
              <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white">
                <option value="credit">Credit</option>
                <option value="refund">Refund</option>
                <option value="correction">Correction</option>
              </select>
            </label>
            <Field label="User ID" value={userId} onChange={(event) => setUserId(event.target.value)} required />
            <Field label="League ID (required for refunds)" value={leagueId} onChange={(event) => setLeagueId(event.target.value)} />
            <Field label="User amount" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            <Field label="Vault amount" type="number" value={vaultAmount} onChange={(event) => setVaultAmount(event.target.value)} required />
            <Field label="Reference" value={reference} onChange={(event) => setReference(event.target.value)} required />
            <div className="md:col-span-2"><TextArea label="Reason" minLength={8} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} required /></div>
            <Button type="submit" loading={adjustState.isLoading}>Confirm adjustment</Button>
            {message ? <div className="self-center text-xs text-zinc-300">{message}</div> : null}
          </form>
        </Card>

        <section>
          <h2 className="mb-2 text-sm font-bold text-white">League reconciliation</h2>
          <div className="space-y-2">
            {summary.data?.leagues.map((league) => (
              <Card key={league.id} className="grid grid-cols-2 gap-2 p-3 text-xs md:grid-cols-6">
                <div className="col-span-2 md:col-span-1"><div className="font-bold text-white">{league.code}</div><div className="text-zinc-500">{league.status}</div></div>
                <div><span className="text-zinc-500">Members</span><div>{league.memberCount}</div></div>
                <div><span className="text-zinc-500">Payments</span><div>{league.entryPayments}</div></div>
                <div><span className="text-zinc-500">Refunds</span><div>{league.refunds}</div></div>
                <div><span className="text-zinc-500">Payouts</span><div>{league.payouts}</div></div>
                <div><span className="text-zinc-500">Vault</span><div className={league.reconciled ? "text-emerald-300" : "text-red-300"}>{league.vaultChips} · {league.reconciled ? "Matched" : "Mismatch"}</div></div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Chip ledger</h2>
            <a href={`/api/operations/ledger.csv${ledgerQuery ? `?${ledgerQuery}` : ""}`} className="flex items-center gap-1 text-xs text-[var(--theme-primary)]"><Download size={13} /> Export CSV</a>
          </div>
          <form
            className="mb-3 grid gap-2 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              const params = new URLSearchParams();
              if (ledgerUserId) params.set("userId", ledgerUserId);
              if (ledgerLeagueId) params.set("leagueId", ledgerLeagueId);
              if (ledgerType) params.set("type", ledgerType);
              if (ledgerReference) params.set("reference", ledgerReference);
              if (ledgerFrom) params.set("from", new Date(`${ledgerFrom}T00:00:00`).toISOString());
              if (ledgerTo) params.set("to", new Date(`${ledgerTo}T23:59:59`).toISOString());
              setLedgerQuery(params.toString());
            }}
          >
            <Field label="User ID" value={ledgerUserId} onChange={(event) => setLedgerUserId(event.target.value)} />
            <Field label="League ID" value={ledgerLeagueId} onChange={(event) => setLedgerLeagueId(event.target.value)} />
            <label className="text-sm text-zinc-300">Transaction type
              <select value={ledgerType} onChange={(event) => setLedgerType(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-white">
                <option value="">All</option>
                <option value="league_entry">League entry</option>
                <option value="vault_payout">Vault payout</option>
                <option value="admin_credit">Admin credit</option>
                <option value="admin_refund">Admin refund</option>
                <option value="admin_correction">Admin correction</option>
              </select>
            </label>
            <Field label="Reference contains" value={ledgerReference} onChange={(event) => setLedgerReference(event.target.value)} />
            <Field label="From" type="date" value={ledgerFrom} onChange={(event) => setLedgerFrom(event.target.value)} />
            <Field label="To" type="date" value={ledgerTo} onChange={(event) => setLedgerTo(event.target.value)} />
            <Button type="submit" variant="secondary">Apply filters</Button>
            <Button type="button" variant="ghost" onClick={() => {
              setLedgerUserId(""); setLedgerLeagueId(""); setLedgerType("");
              setLedgerReference(""); setLedgerFrom(""); setLedgerTo(""); setLedgerQuery("");
            }}>Clear</Button>
          </form>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-white/5 text-zinc-400"><tr><th className="p-2">Date</th><th className="p-2">User</th><th className="p-2">Type</th><th className="p-2">Amount</th><th className="p-2">Balance</th><th className="p-2">Reference</th></tr></thead>
              <tbody>{ledger.data?.rows.map((row) => <tr key={row.id} className="border-t border-white/5"><td className="p-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td><td className="p-2">{row.username}</td><td className="p-2">{row.type}</td><td className={`p-2 ${row.amount >= 0 ? "text-emerald-300" : "text-red-300"}`}>{row.amount}</td><td className="p-2">{row.balanceAfter}</td><td className="p-2">{row.reference ?? "—"}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-bold text-white">Audit history</h2>
          <div className="space-y-2">{audit.data?.map((entry) => <Card key={entry.id} className="p-3 text-xs"><div className="font-semibold text-white">{entry.action}</div><div className="text-zinc-400">{entry.reason}</div><div className="mt-1 text-zinc-600">{new Date(entry.createdAt).toLocaleString()} · {entry.actorUserId}</div></Card>)}</div>
        </section>
      </div>
    </>
  );
}
