import { z } from "zod";
import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ACC, FinanceError, accountId, atomic, post, reverse } from "./ledger";

export type ServiceKind = "wallet_deposit" | "wallet_withdrawal" | "recharge" | "misc_income" | "other_commission";
export const SERVICE_LABEL: Record<ServiceKind, string> = {
  wallet_deposit: "Wallet deposit (customer pays cash, you send to their wallet)",
  wallet_withdrawal: "Wallet withdrawal (customer receives cash)",
  recharge: "Mobile recharge / load",
  misc_income: "Other income",
  other_commission: "Commission received",
};

export function computeFee(mode: "fixed" | "percent", value: number, principal: number): number {
  if (!(value >= 0)) throw new FinanceError("The fee cannot be negative.");
  return mode === "fixed" ? Math.round(value) : Math.round((principal * value) / 100);
}

const schema = z.object({
  kind: z.enum(["wallet_deposit", "wallet_withdrawal", "recharge", "misc_income", "other_commission"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  principal: z.number().int().min(0).default(0),
  feeMode: z.enum(["fixed", "percent"]).default("fixed"),
  feeValue: z.number().min(0).default(0),
  cashAccount: z.string().optional(),   // where the customer pays / is paid (cash drawer by default)
  walletAccount: z.string().optional(), // wallet or load balance the principal moves through
  feeAccount: z.string().optional(),    // where the fee lands (defaults to the cash account)
  customerName: z.string().trim().max(80).optional(), customerPhone: z.string().trim().max(30).optional(), note: z.string().trim().max(200).optional(),
});

/**
 * Wallet and other services. The PRINCIPAL only moves between your own accounts (cash <-> wallet) and is never revenue; the fee or
 * commission is the only income. Deposit: customer hands over principal + fee in cash, you send principal from the wallet.
 * Withdrawal: you hand over principal in cash, the wallet gains it; the fee is paid to you separately.
 */
export async function addService(db: Db, raw: unknown, actor: string, key: string): Promise<string> {
  const s = schema.parse(raw);
  const fee = computeFee(s.feeMode, s.feeValue, s.principal);
  const needsWallet = s.kind === "wallet_deposit" || s.kind === "wallet_withdrawal" || s.kind === "recharge";
  if (needsWallet && s.principal <= 0) throw new FinanceError("Enter the amount sent or received.");
  if (needsWallet && !s.walletAccount) throw new FinanceError("Choose the wallet (JazzCash, Easypaisa, load balance) it moves through.");
  if (!needsWallet && fee <= 0) throw new FinanceError("Enter the income amount.");
  const cash = s.cashAccount ?? ACC.cash;
  const feeAcc = s.feeAccount ?? cash;
  return atomic(db, async (q) => {
    const dup = await q.query<{ id: string }>("select id from service_entries where journal_id in (select id from fin_journals where idem_key = $1)", [`service:${key}`]);
    if (dup[0]) return dup[0].id;
    const lines = s.kind === "wallet_withdrawal"
      ? [{ account: s.walletAccount!, debit: s.principal }, { account: cash, credit: s.principal }, { account: feeAcc, debit: fee }, { account: ACC.serviceIncome, credit: fee }]
      : needsWallet
        ? [{ account: cash, debit: s.principal + fee }, { account: s.walletAccount!, credit: s.principal }, { account: ACC.serviceIncome, credit: fee }]
        : [{ account: feeAcc, debit: fee }, { account: ACC.serviceIncome, credit: fee }];
    const j = await post(q, { key: `service:${key}`, date: s.date, memo: SERVICE_LABEL[s.kind], refType: "service", actor, lines });
    const id = (await q.query<{ id: string }>(
      `insert into service_entries(occurred_on, kind, principal, fee_mode, fee_value, fee_amount, cash_account_id, wallet_account_id, fee_account_id, customer_name, customer_phone, note, journal_id, created_by)
       values (coalesce($1::date, (now() at time zone 'Asia/Karachi')::date),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
      [s.date ?? null, s.kind, s.principal, s.feeMode, s.feeValue, fee, await accountId(q, cash), s.walletAccount ? await accountId(q, s.walletAccount) : null, await accountId(q, feeAcc),
        s.customerName ?? null, s.customerPhone ?? null, s.note ?? null, j?.id ?? null, actor]))[0].id;
    await audit(actor, "service_entry_added", "service_entry", id, { kind: s.kind, principal: s.principal, fee }, q);
    return id;
  });
}

export async function voidService(db: Db, id: string, actor: string, why: string): Promise<void> {
  await atomic(db, async (q) => {
    const e = (await q.query<{ journal_id: string | null; voided_at: string | null }>("select journal_id, voided_at from service_entries where id = $1 for update", [id]))[0];
    if (!e) throw new FinanceError("Entry not found.");
    if (e.voided_at) return;
    if (e.journal_id) await reverse(q, e.journal_id, actor, why);
    await q.query("update service_entries set voided_at = now() where id = $1", [id]);
    await audit(actor, "service_entry_voided", "service_entry", id, { why }, q);
  });
}
