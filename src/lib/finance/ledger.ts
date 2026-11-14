import type { Db, Queryable } from "@/lib/db";

export class FinanceError extends Error {}

/** Run fn atomically: inside the caller's transaction if there is one, otherwise in a new one. Multi-row ledger writes must never autocommit row by row. */
export async function atomic<T>(q: Queryable | Db, fn: (q: Queryable) => Promise<T>): Promise<T> {
  return "tx" in q && typeof (q as Db).tx === "function" ? (q as Db).tx(fn) : fn(q);
}

/** Well-known account codes (see migration 018). Money accounts can also be added by the owner. */
export const ACC = {
  cash: "1000", bank: "1010", jazzcash: "1020", easypaisa: "1030",
  receivable: "1100", inventory: "1200", payable: "2000", advances: "2100", equity: "3000",
  sales: "4000", shippingIncome: "4010", repairIncome: "4020", discounts: "4090", serviceIncome: "4100", refunds: "4200",
  cogs: "5000", writeOff: "5100",
} as const;

export interface JournalLine { account: string; debit?: number; credit?: number; partyType?: string; partyId?: string }
export interface JournalInput {
  /** Unique per business event. Posting the same key twice does nothing, so retries and duplicate webhooks cannot double-post. */
  key: string;
  memo: string;
  lines: JournalLine[];
  date?: string; // YYYY-MM-DD, Pakistan time by default
  refType?: string; refId?: string; actor?: string;
  reverses?: string;
}

const int = (n: number | undefined, what: string) => {
  const v = n ?? 0;
  if (!Number.isSafeInteger(v) || v < 0) throw new FinanceError(`${what} must be a whole number of rupees, zero or more.`);
  return v;
};

/** Resolve an account code (or uuid) to its id. */
export async function accountId(q: Queryable, codeOrId: string): Promise<string> {
  const r = await q.query<{ id: string }>("select id from fin_accounts where (code = $1 or id::text = $1) and active", [codeOrId]);
  if (!r[0]) throw new FinanceError(`Unknown or inactive account: ${codeOrId}`);
  return r[0].id;
}

/**
 * Post one balanced journal. Idempotent by key. Returns { id, created:false } when it was already posted,
 * and null when every line was zero (nothing to record).
 */
export async function post(q: Queryable | Db, j: JournalInput): Promise<{ id: string; created: boolean } | null> {
  return atomic(q, (t) => postIn(t, j));
}
async function postIn(q: Queryable, j: JournalInput): Promise<{ id: string; created: boolean } | null> {
  const lines = j.lines.map((l) => ({ ...l, debit: int(l.debit, "debit"), credit: int(l.credit, "credit") })).filter((l) => l.debit > 0 || l.credit > 0);
  if (!lines.length) return null;
  if (lines.some((l) => l.debit > 0 && l.credit > 0)) throw new FinanceError("A ledger line is either a debit or a credit, not both.");
  const d = lines.reduce((s, l) => s + l.debit, 0);
  const c = lines.reduce((s, l) => s + l.credit, 0);
  if (d !== c) throw new FinanceError(`Journal does not balance (debits ${d}, credits ${c}).`);
  const made = await q.query<{ id: string }>(
    `insert into fin_journals(idem_key, effective_date, memo, ref_type, ref_id, reverses_id, actor)
     values ($1, coalesce($2::date, (now() at time zone 'Asia/Karachi')::date), $3, $4, $5, $6, $7)
     on conflict (idem_key) do nothing returning id`,
    [j.key, j.date ?? null, j.memo, j.refType ?? null, j.refId ?? null, j.reverses ?? null, j.actor ?? null]);
  if (!made[0]) {
    const old = await q.query<{ id: string }>("select id from fin_journals where idem_key = $1", [j.key]);
    return { id: old[0].id, created: false };
  }
  for (const l of lines) {
    await q.query("insert into fin_entries(journal_id, account_id, debit, credit, party_type, party_id) values ($1,$2,$3,$4,$5,$6)",
      [made[0].id, await accountId(q, l.account), l.debit, l.credit, l.partyType ?? null, l.partyId ?? null]);
  }
  return { id: made[0].id, created: true };
}

/** Undo a posted journal with an equal and opposite journal. Never edits or deletes. Safe to call twice. */
export async function reverse(q0: Queryable | Db, journalId: string, actor: string, why: string): Promise<{ id: string; created: boolean } | null> {
  return atomic(q0, (q) => reverseIn(q, journalId, actor, why));
}
async function reverseIn(q: Queryable, journalId: string, actor: string, why: string): Promise<{ id: string; created: boolean } | null> {
  const orig = await q.query<{ memo: string; effective_date: string; ref_type: string | null; ref_id: string | null }>(
    "select memo, effective_date::text, ref_type, ref_id from fin_journals where id = $1", [journalId]);
  if (!orig[0]) throw new FinanceError("Journal not found.");
  const es = await q.query<{ code: string; debit: number; credit: number; party_type: string | null; party_id: string | null }>(
    "select a.code, e.debit, e.credit, e.party_type, e.party_id from fin_entries e join fin_accounts a on a.id = e.account_id where e.journal_id = $1", [journalId]);
  return post(q, {
    key: `reverse:${journalId}`, memo: `Reversal: ${orig[0].memo} (${why})`, refType: orig[0].ref_type ?? undefined, refId: orig[0].ref_id ?? undefined,
    actor, reverses: journalId,
    lines: es.map((e) => ({ account: e.code, debit: Number(e.credit), credit: Number(e.debit), partyType: e.party_type ?? undefined, partyId: e.party_id ?? undefined })),
  });
}

export interface AccountBalance { id: string; code: string; name: string; type: string; kind: string; balance: number }

/** Net balance = debits minus credits (positive for money accounts that hold money). Optional date range on journal effective date. */
export async function balances(q: Queryable, opts: { from?: string; to?: string } = {}): Promise<AccountBalance[]> {
  const rows = await q.query<{ id: string; code: string; name: string; type: string; kind: string; bal: string | number }>(
    `select a.id, a.code, a.name, a.type, a.kind, coalesce(sum(e.debit - e.credit), 0) as bal
     from fin_accounts a
     left join (select e.* from fin_entries e join fin_journals j on j.id = e.journal_id
                where ($1::date is null or j.effective_date >= $1::date) and ($2::date is null or j.effective_date <= $2::date)) e on e.account_id = a.id
     group by a.id order by a.code`, [opts.from ?? null, opts.to ?? null]);
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, type: r.type, kind: r.kind, balance: Number(r.bal) }));
}

export async function balanceOf(q: Queryable, code: string): Promise<number> {
  const r = await q.query<{ b: string | number }>(
    "select coalesce(sum(e.debit - e.credit),0) as b from fin_entries e join fin_accounts a on a.id = e.account_id where a.code = $1 or a.id::text = $1", [code]);
  return Number(r[0]?.b ?? 0);
}

/** Total debits equal total credits across the whole ledger. Used by tests and the reconciliation check. */
export async function ledgerIsBalanced(q: Queryable): Promise<boolean> {
  const r = await q.query<{ d: string | number; c: string | number }>("select coalesce(sum(debit),0) as d, coalesce(sum(credit),0) as c from fin_entries");
  return Number(r[0].d) === Number(r[0].c);
}

/** Money accounts the owner can pay from / receive into. */
export async function moneyAccounts(q: Queryable): Promise<{ id: string; code: string; name: string; kind: string }[]> {
  return q.query("select id, code, name, kind from fin_accounts where kind in ('cash','bank','wallet') and active order by code");
}
