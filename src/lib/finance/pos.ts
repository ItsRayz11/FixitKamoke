import crypto from "node:crypto";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { saleNowSql } from "@/lib/domain/sale";
import { createCreditItem, ensureParty } from "./credit";
import { ACC, FinanceError, accountId, atomic, post, reverse } from "./ledger";
import { issueStock, receiveStock } from "./stock";

const posSchema = z.object({
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1), unitPrice: z.number().int().min(0).optional() })).min(1, "Add at least one item."),
  discount: z.number().int().min(0).default(0),
  customerName: z.string().trim().max(80).optional(), customerPhone: z.string().trim().max(30).optional(),
  payAccount: z.string().default(ACC.cash),
  /** Amount received now. Less than the total leaves the rest as customer credit (udhaar). */
  paid: z.number().int().min(0).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  allowOverLimit: z.boolean().optional(),
});
export type PosInput = z.infer<typeof posSchema>;

/**
 * A walk-in sale at the counter. Uses the same products and stock as the web shop. Revenue is recognised immediately (the goods
 * leave in your hand), cost comes from the average cost at that moment, and any unpaid part is customer credit: it raises receivables
 * and sales but adds no cash. Safe to retry with the same key.
 */
export async function ringUpSale(db: Db, raw: unknown, actor: string, key: string): Promise<{ id: string; receiptNo: string; total: number; credit: number; duplicate: boolean }> {
  const s = posSchema.parse(raw);
  return atomic(db, async (q) => {
    const dup = await q.query<{ id: string; receipt_no: string; total: number; paid_amount: number }>("select id, receipt_no, total, paid_amount from pos_sales where idem_key = $1", [key]);
    if (dup[0]) return { id: dup[0].id, receiptNo: dup[0].receipt_no, total: dup[0].total, credit: dup[0].total - dup[0].paid_amount, duplicate: true };

    const lines: { productId: string; name: string; quantity: number; unitPrice: number; unitCost: number | null; unknown: number }[] = [];
    let subtotal = 0; let cogs = 0;
    const receiptNo = `POS-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    for (const it of s.items) {
      const p = (await q.query<{ name: string; price: number; sale: number | null }>(`select name, price, ${saleNowSql("")} as sale from products where id = $1`, [it.productId]))[0];
      if (!p) throw new FinanceError("A product on the sale no longer exists.");
      const out = await issueStock(q, it.productId, it.quantity, "pos_sale", { key: `pos:${key}:${it.productId}`, refType: "pos", refId: receiptNo, actor }, true).catch((e) => {
        throw e instanceof FinanceError && /Not enough stock/.test(e.message) ? new FinanceError(`Not enough stock of “${p.name}”.`) : e;
      });
      const unitPrice = it.unitPrice ?? p.sale ?? p.price;
      subtotal += unitPrice * it.quantity;
      cogs += Math.round((out?.valuedQty ?? 0) * (out?.unitCost ?? 0));
      lines.push({ productId: it.productId, name: p.name, quantity: it.quantity, unitPrice, unitCost: out?.unitCost ?? null, unknown: out?.unknownQty ?? it.quantity });
    }
    if (s.discount > subtotal) throw new FinanceError("The discount is larger than the sale.");
    const total = subtotal - s.discount;
    const paid = Math.min(s.paid ?? total, total);
    const credit = total - paid;
    let creditItem: string | null = null;
    let partyId: string | null = null;
    if (credit > 0) {
      if (!s.customerName && !s.customerPhone) throw new FinanceError("Enter the customer's name or phone for a credit sale.");
      partyId = await ensureParty(q, { kind: "customer", name: s.customerName ?? s.customerPhone ?? "Customer", phone: s.customerPhone ?? null });
    }
    const j = await post(q, {
      key: `pos:${key}`, memo: `Counter sale ${receiptNo}`, refType: "pos", refId: receiptNo, actor,
      lines: [
        { account: s.payAccount, debit: paid },
        { account: ACC.receivable, debit: credit, partyType: "customer", partyId: partyId ?? undefined },
        { account: ACC.discounts, debit: s.discount },
        { account: ACC.sales, credit: subtotal },
        { account: ACC.cogs, debit: cogs },
        { account: ACC.inventory, credit: cogs },
      ],
    });
    const sale = (await q.query<{ id: string }>(
      `insert into pos_sales(receipt_no, idem_key, customer_name, customer_phone, subtotal, discount, total, paid_amount, pay_account_id, journal_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [receiptNo, key, s.customerName ?? null, s.customerPhone ?? null, subtotal, s.discount, total, paid, await accountId(q, s.payAccount), j?.id ?? null, actor]))[0].id;
    for (const l of lines) {
      await q.query("insert into pos_sale_items(pos_sale_id, product_id, product_name, quantity, unit_price, line_total, unit_cost, cost_unknown_qty) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [sale, l.productId, l.name, l.quantity, l.unitPrice, l.unitPrice * l.quantity, l.unitCost, l.unknown]);
    }
    if (credit > 0 && partyId) creditItem = await createCreditItem(q, { partyId, direction: "receivable", sourceType: "pos_sale", sourceId: sale, amount: credit, dueDate: s.dueDate ?? null, allowOverLimit: s.allowOverLimit });
    await audit(actor, "pos_sale", "pos_sale", sale, { receiptNo, total, paid, credit, creditItem }, q);
    return { id: sale, receiptNo, total, credit, duplicate: false };
  });
}

/** Void a counter sale: reverses the money and goods exactly (stock back at the cost it left with). */
export async function voidPosSale(db: Db, saleId: string, actor: string, why: string): Promise<void> {
  await atomic(db, async (q) => {
    const s = (await q.query<{ status: string; journal_id: string | null; receipt_no: string }>("select status, journal_id, receipt_no from pos_sales where id = $1 for update", [saleId]))[0];
    if (!s) throw new FinanceError("Sale not found.");
    if (s.status === "voided") return;
    const paidCredit = await q.query("select 1 from credit_items i where i.source_type = 'pos_sale' and i.source_id = $1 and i.paid > 0", [saleId]);
    if (paidCredit[0]) throw new FinanceError("Part of the credit on this sale was already repaid. Record a refund instead of voiding it.");
    const items = await q.query<{ id: string; product_id: string | null; quantity: number; unit_cost: string | null; cost_unknown_qty: number }>("select id, product_id, quantity, unit_cost, cost_unknown_qty from pos_sale_items where pos_sale_id = $1", [saleId]);
    for (const it of items) {
      if (it.product_id) await receiveStock(q, it.product_id, it.quantity, it.unit_cost == null ? null : Number(it.unit_cost), "return", { key: `pos-void:${saleId}:${it.id}`, refType: "pos", refId: s.receipt_no, actor }, it.cost_unknown_qty);
    }
    if (s.journal_id) await reverse(q, s.journal_id, actor, why);
    await q.query("update credit_items set status = 'void' where source_type = 'pos_sale' and source_id = $1", [saleId]);
    await q.query("update pos_sales set status = 'voided' where id = $1", [saleId]);
    await audit(actor, "pos_sale_voided", "pos_sale", saleId, { why }, q);
  });
}
