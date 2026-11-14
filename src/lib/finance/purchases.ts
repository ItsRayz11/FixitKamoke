import { z } from "zod";
import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createCreditItem, ensureParty, payCredit } from "./credit";
import { ACC, FinanceError, post } from "./ledger";
import { receiveStock } from "./stock";

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Enter the supplier name.").max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().max(120).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function saveSupplier(db: Db, raw: unknown, actor: string, id?: string): Promise<string> {
  const s = supplierSchema.parse(raw);
  return db.tx(async (q) => {
    let sid = id;
    if (id) await q.query("update suppliers set name=$2, phone=$3, email=$4, address=$5, notes=$6 where id=$1", [id, s.name, s.phone ?? null, s.email ?? null, s.address ?? null, s.notes ?? null]);
    else sid = (await q.query<{ id: string }>("insert into suppliers(name, phone, email, address, notes) values ($1,$2,$3,$4,$5) returning id", [s.name, s.phone ?? null, s.email ?? null, s.address ?? null, s.notes ?? null]))[0].id;
    await audit(actor, id ? "supplier_updated" : "supplier_created", "supplier", sid!, { name: s.name }, q);
    return sid!;
  });
}

export const purchaseSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  invoiceNo: z.string().trim().max(80).optional().nullable(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  discount: z.number().int().min(0).default(0),
  transportCost: z.number().int().min(0).default(0),
  otherCost: z.number().int().min(0).default(0),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    packType: z.enum(["unit", "box"]),
    qty: z.number().int().min(1),
    unitsPerBox: z.number().int().min(1).default(1),
    cost: z.number().min(0), // per unit, or per box when packType = box
  })).min(1, "Add at least one product."),
});
export type PurchaseInput = z.infer<typeof purchaseSchema>;

/** Create a DRAFT purchase. Nothing in stock or the ledger changes until it is received. */
export async function createPurchase(db: Db, raw: unknown, actor: string): Promise<string> {
  const p = purchaseSchema.parse(raw);
  return db.tx(async (q) => {
    const lines = p.items.map((i) => {
      const per = i.packType === "box" ? i.unitsPerBox : 1;
      return { ...i, per, units: i.qty * per, total: Math.round(i.qty * i.cost) };
    });
    const itemsTotal = lines.reduce((s, l) => s + l.total, 0);
    const total = itemsTotal - p.discount + p.transportCost + p.otherCost;
    if (total < 0) throw new FinanceError("The discount is larger than the purchase.");
    const id = (await q.query<{ id: string }>(
      `insert into purchases(supplier_id, invoice_no, purchase_date, items_total, discount, transport_cost, other_cost, total_cost, due_date, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
      [p.supplierId ?? null, p.invoiceNo ?? null, p.purchaseDate, itemsTotal, p.discount, p.transportCost, p.otherCost, total, p.dueDate ?? null, p.note ?? null, actor]))[0].id;
    for (const l of lines) {
      await q.query(
        "insert into purchase_items(purchase_id, product_id, pack_type, qty_entered, units_per_box, units_received, cost_entered, line_total) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [id, l.productId, l.packType, l.qty, l.per, l.units, l.cost, l.total]);
    }
    await audit(actor, "purchase_created", "purchase", id, { total }, q);
    return id;
  });
}

/**
 * Receive goods: stock goes up now, at landed unit cost (line cost plus its share of transport and other cost, minus its share of the
 * discount), the moving average is updated, and Inventory is debited against Payables. Safe to call twice: the second call changes nothing.
 * `payNow` optionally pays part or all from a money account straight away; the remainder stays as a supplier balance.
 */
export async function receivePurchase(db: Db, purchaseId: string, actor: string, payNow?: { amount: number; account: string }): Promise<void> {
  const itemId = await db.tx(async (q): Promise<string | null> => {
    const p = (await q.query<{ status: string; supplier_id: string | null; items_total: number; discount: number; transport_cost: number; other_cost: number; total_cost: number; due_date: string | null; purchase_date: string; invoice_no: string | null }>(
      "select status, supplier_id, items_total, discount, transport_cost, other_cost, total_cost, due_date::text, purchase_date::text, invoice_no from purchases where id = $1 for update", [purchaseId]))[0];
    if (!p) throw new FinanceError("Purchase not found.");
    if (p.status === "received") return null; // already done
    if (p.status !== "draft") throw new FinanceError("Only a draft purchase can be received.");
    const items = await q.query<{ id: string; product_id: string; units_received: number; line_total: number }>(
      "select id, product_id, units_received, line_total from purchase_items where purchase_id = $1 order by id", [purchaseId]);
    const extra = p.transport_cost + p.other_cost - p.discount; // spread by value (or by units when everything was free)
    const totalUnits = items.reduce((s, i) => s + i.units_received, 0);
    for (const it of items) {
      const share = p.items_total > 0 ? it.line_total / p.items_total : it.units_received / totalUnits;
      const landed = (it.line_total + share * extra) / it.units_received;
      await q.query("update purchase_items set landed_unit_cost = $2 where id = $1", [it.id, landed]);
      await receiveStock(q, it.product_id, it.units_received, landed, "purchase", { key: `purchase:${purchaseId}:${it.id}`, refType: "purchase", refId: purchaseId, actor });
    }
    const party = p.supplier_id ? await ensureParty(q, { kind: "supplier", name: (await q.query<{ name: string }>("select name from suppliers where id = $1", [p.supplier_id]))[0].name, supplierId: p.supplier_id }) : null;
    await post(q, {
      key: `purchase:${purchaseId}:received`, date: p.purchase_date, memo: `Purchase received${p.invoice_no ? ` (invoice ${p.invoice_no})` : ""}`, refType: "purchase", refId: purchaseId, actor,
      lines: [{ account: ACC.inventory, debit: p.total_cost }, { account: ACC.payable, credit: p.total_cost, partyType: party ? "supplier" : undefined, partyId: party ?? undefined }],
    });
    await q.query("update purchases set status = 'received', received_at = now() where id = $1", [purchaseId]);
    let itemId: string | null = null;
    if (p.total_cost > 0) {
      const partyId = party ?? (await ensureParty(q, { kind: "supplier", name: "Unknown supplier", phone: "none" }));
      itemId = await createCreditItem(q, { partyId, direction: "payable", sourceType: "purchase", sourceId: purchaseId, amount: p.total_cost, dueDate: p.due_date, note: p.invoice_no ?? undefined });
    }
    await audit(actor, "purchase_received", "purchase", purchaseId, { total: p.total_cost }, q);
    return itemId;
  });
  // Runs after the receipt commits, in its own transaction; the key makes a retry harmless.
  if (payNow && payNow.amount > 0) {
    if (!itemId) throw new FinanceError("Nothing to pay on this purchase.");
    await payCredit(db, itemId, payNow.amount, payNow.account, actor, `purchase-pay:${purchaseId}:initial`);
  }
}

/** Pay (part of) a received purchase. */
export async function payPurchase(db: Db, purchaseId: string, amount: number, account: string, actor: string, key: string): Promise<void> {
  const it = await db.query<{ id: string }>("select id from credit_items where source_type = 'purchase' and source_id = $1", [purchaseId]);
  if (!it[0]) throw new FinanceError("This purchase has nothing outstanding.");
  await payCredit(db, it[0].id, amount, account, actor, key);
}

export async function cancelDraftPurchase(db: Db, purchaseId: string, actor: string): Promise<void> {
  await db.tx(async (q) => {
    const r = await q.query("update purchases set status = 'cancelled' where id = $1 and status = 'draft' returning id", [purchaseId]);
    if (!r[0]) throw new FinanceError("Only a draft purchase can be cancelled. A received purchase must be corrected with a return or adjustment.");
    await audit(actor, "purchase_cancelled", "purchase", purchaseId, {}, q);
  });
}
