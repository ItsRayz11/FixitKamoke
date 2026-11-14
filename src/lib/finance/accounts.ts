import { z } from "zod";
import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ACC, FinanceError, accountId, atomic, post } from "./ledger";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const amt = z.number().int().positive("Enter an amount greater than zero.");

/** Add a cash, bank or wallet account (e.g. a second bank). Optional opening balance is posted against Owner equity, not typed into a balance field. */
export async function createMoneyAccount(db: Db, raw: { name: string; kind: "cash" | "bank" | "wallet"; openingBalance?: number; openingDate?: string }, actor: string): Promise<string> {
  const v = z.object({ name: z.string().trim().min(2).max(60), kind: z.enum(["cash", "bank", "wallet"]), openingBalance: z.number().int().min(0).optional(), openingDate: day }).parse(raw);
  return db.tx(async (q) => {
    const max = (await q.query<{ m: string | null }>("select max(code) as m from fin_accounts where code ~ '^10[0-9]{2}$'"))[0].m;
    const code = String(Number(max ?? "1030") + 10);
    if (Number(code) >= 1100) throw new FinanceError("That is the maximum number of money accounts.");
    const id = (await q.query<{ id: string }>("insert into fin_accounts(code, name, type, kind) values ($1,$2,'asset',$3) returning id", [code, v.name, v.kind]))[0].id;
    if (v.openingBalance) await post(q, { key: `opening:${id}`, date: v.openingDate, memo: `Opening balance: ${v.name}`, refType: "account", refId: id, actor, lines: [{ account: id, debit: v.openingBalance }, { account: ACC.equity, credit: v.openingBalance }] });
    await audit(actor, "money_account_created", "fin_account", id, { name: v.name, kind: v.kind, openingBalance: v.openingBalance ?? 0 }, q);
    return id;
  });
}

/** Set the opening balance of an existing account, once. Anything later is a deposit, withdrawal, transfer or reconciliation. */
export async function setOpeningBalance(db: Db, account: string, amount: number, date: string | undefined, actor: string): Promise<void> {
  const n = amt.parse(amount);
  await atomic(db, async (q) => {
    const id = await accountId(q, account);
    await post(q, { key: `opening:${id}`, date, memo: "Opening balance", refType: "account", refId: id, actor, lines: [{ account: id, debit: n }, { account: ACC.equity, credit: n }] });
    await audit(actor, "opening_balance_set", "fin_account", id, { amount: n }, q);
  });
}

/** Move money between two of the shop's own accounts. Not income, not expense. `key` makes a double click harmless. */
export async function transfer(db: Db, i: { from: string; to: string; amount: number; date?: string; note?: string; key: string }, actor: string): Promise<void> {
  const n = amt.parse(i.amount);
  if (i.from === i.to) throw new FinanceError("Choose two different accounts.");
  await atomic(db, async (q) => {
    await post(q, { key: `transfer:${i.key}`, date: i.date, memo: `Transfer${i.note ? `: ${i.note}` : ""}`, refType: "transfer", actor,
      lines: [{ account: i.to, debit: n }, { account: i.from, credit: n }] });
    await audit(actor, "account_transfer", "fin_account", null, { from: i.from, to: i.to, amount: n, note: i.note ?? null }, q);
  });
}

/** Owner puts money in or takes money out of the business (not a sale or an expense). */
export async function ownerMovement(db: Db, i: { account: string; direction: "in" | "out"; amount: number; date?: string; note?: string; key: string }, actor: string): Promise<void> {
  const n = amt.parse(i.amount);
  await atomic(db, async (q) => {
    await post(q, { key: `owner:${i.key}`, date: i.date, memo: `Owner ${i.direction === "in" ? "deposit" : "withdrawal"}${i.note ? `: ${i.note}` : ""}`, refType: "owner", actor,
      lines: i.direction === "in" ? [{ account: i.account, debit: n }, { account: ACC.equity, credit: n }] : [{ account: ACC.equity, debit: n }, { account: i.account, credit: n }] });
    await audit(actor, "owner_movement", "fin_account", null, { ...i, amount: n }, q);
  });
}

/** Reconciliation: the real balance differs from the books. Posts the difference openly to "Cash and balance differences" with a reason. */
export async function reconcile(db: Db, i: { account: string; actualBalance: number; reason: string; key: string }, actor: string): Promise<number> {
  if (!i.reason.trim()) throw new FinanceError("Write the reason for the difference.");
  if (!Number.isSafeInteger(i.actualBalance) || i.actualBalance < 0) throw new FinanceError("Enter the real balance in whole rupees.");
  return atomic(db, async (q) => {
    const cur = Number((await q.query<{ b: string | number }>("select coalesce(sum(debit - credit),0) as b from fin_entries where account_id = $1", [await accountId(q, i.account)]))[0].b);
    const diff = i.actualBalance - cur;
    if (diff === 0) return 0;
    await post(q, { key: `reconcile:${i.key}`, memo: `Reconciliation: ${i.reason.trim()}`, refType: "reconcile", actor,
      lines: diff > 0 ? [{ account: i.account, debit: diff }, { account: "5200", credit: diff }] : [{ account: "5200", debit: -diff }, { account: i.account, credit: -diff }] });
    await audit(actor, "account_reconciled", "fin_account", null, { account: i.account, from: cur, to: i.actualBalance, reason: i.reason }, q);
    return diff;
  });
}
