import { z } from "zod";
import type { Db, Queryable } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createCreditItem, ensureParty } from "./credit";
import { ACC, FinanceError, accountId, atomic, post, reverse } from "./ledger";
import { issueStock, receiveStock } from "./stock";

const isRecognized = async (q: Queryable, id: string) => (await q.query("select 1 from fin_journals where idem_key = $1", [`repair:${id}:recognized`])).length > 0;

/**
 * Add a spare part to a repair. A part taken from stock leaves the shelf now (ledgered, costed at the average) and its cost is expensed
 * to this repair. A part bought outside needs its cost and the account it was paid from. Nothing is ever guessed.
 */
export async function addRepairPart(db: Db, repairId: string, raw: { productId?: string | null; description?: string; quantity: number; unitCost?: number; payAccount?: string }, actor: string, key: string): Promise<string> {
  const p = z.object({ productId: z.string().uuid().nullish(), description: z.string().trim().max(120).optional(), quantity: z.number().int().min(1), unitCost: z.number().min(0).optional(), payAccount: z.string().optional() }).parse(raw);
  return atomic(db, async (q) => {
    const done = await q.query<{ id: string }>("select id from repair_parts where id::text = $1", [key]);
    if (done[0]) return done[0].id;
    const r = await q.query("select 1 from repair_inquiries where id = $1", [repairId]);
    if (!r[0]) throw new FinanceError("Repair not found.");
    let cost: number | null; let unknown = 0; let desc = p.description ?? "";
    let postedFromStock = false;
    if (p.productId) {
      const prod = (await q.query<{ name: string }>("select name from products where id = $1", [p.productId]))[0];
      if (!prod) throw new FinanceError("Product not found.");
      desc = desc || prod.name;
      const out = await issueStock(q, p.productId, p.quantity, "repair_use", { key: `repair-part:${key}`, refType: "repair", refId: repairId, actor }, true);
      cost = out?.unitCost ?? null; unknown = out?.unknownQty ?? p.quantity; postedFromStock = true;
      const valued = Math.round((out?.valuedQty ?? 0) * (out?.unitCost ?? 0));
      await post(q, { key: `repair-part-cogs:${key}`, memo: `Repair part: ${desc}`, refType: "repair", refId: repairId, actor, lines: [{ account: ACC.cogs, debit: valued }, { account: ACC.inventory, credit: valued }] });
    } else {
      if (p.unitCost === undefined || !p.payAccount) throw new FinanceError("For a part bought outside, enter its cost and the account you paid from.");
      if (!desc) throw new FinanceError("Describe the part.");
      cost = p.unitCost;
      const total = Math.round(p.unitCost * p.quantity);
      await post(q, { key: `repair-part-cash:${key}`, memo: `Repair part (bought): ${desc}`, refType: "repair", refId: repairId, actor, lines: [{ account: ACC.cogs, debit: total }, { account: p.payAccount, credit: total }] });
    }
    void postedFromStock;
    const id = (await q.query<{ id: string }>("insert into repair_parts(id, repair_id, product_id, description, quantity, unit_cost, cost_unknown_qty) values ($1,$2,$3,$4,$5,$6,$7) returning id",
      [key, repairId, p.productId ?? null, desc, p.quantity, cost, unknown]))[0].id;
    await audit(actor, "repair_part_added", "repair", repairId, { desc, quantity: p.quantity }, q);
    return id;
  });
}

/** The repair is finished: its charge becomes income now. Money already paid is applied; the rest is a receivable (or credit). Idempotent. */
export async function recognizeRepair(q: Queryable, repairId: string, actor: string): Promise<void> {
  const r = (await q.query<{ reference: string; final_charge: number | null; approved_amount: number | null; estimate_amount: number | null; phone: string; customer_name: string }>(
    "select reference, final_charge, approved_amount, estimate_amount, phone, customer_name from repair_inquiries where id = $1", [repairId]))[0];
  if (!r) throw new FinanceError("Repair not found.");
  const charge = r.final_charge ?? r.approved_amount ?? 0;
  const held = Number((await q.query<{ n: string | number }>(
    `select coalesce(sum(e.credit - e.debit),0) as n from fin_entries e join fin_journals j on j.id = e.journal_id join fin_accounts a on a.id = e.account_id
     where j.ref_type = 'repair' and j.ref_id = $1 and a.code = $2`, [repairId, ACC.advances]))[0].n);
  const applied = Math.min(Math.max(held, 0), charge);
  await post(q, { key: `repair:${repairId}:recognized`, memo: `Repair completed: ${r.reference}`, refType: "repair", refId: repairId, actor,
    lines: [{ account: ACC.advances, debit: applied }, { account: ACC.receivable, debit: charge - applied, partyType: "customer", partyId: r.phone }, { account: ACC.repairIncome, credit: charge }] });
}

/** Customer pays (part of) a repair. Before completion it is a customer advance; after, it settles the receivable. Safe to retry with the same key. */
export async function recordRepairPayment(db: Db, repairId: string, amount: number, account: string, actor: string, key: string): Promise<void> {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new FinanceError("Enter the amount received.");
  await atomic(db, async (q) => {
    if ((await q.query("select 1 from repair_payments where idem_key = $1", [key]))[0]) return;
    const r = (await q.query<{ phone: string }>("select phone from repair_inquiries where id = $1", [repairId]))[0];
    if (!r) throw new FinanceError("Repair not found.");
    const recognized = await isRecognized(q, repairId);
    const j = await post(q, { key: `repair-pay:${key}`, memo: "Repair payment received", refType: "repair", refId: repairId, actor,
      lines: [{ account, debit: amount }, recognized ? { account: ACC.receivable, credit: amount, partyType: "customer", partyId: r.phone } : { account: ACC.advances, credit: amount }] });
    await q.query("insert into repair_payments(repair_id, amount, account_id, journal_id, idem_key, actor) values ($1,$2,$3,$4,$5,$6)", [repairId, amount, await accountId(q, account), j?.id ?? null, key, actor]);
    await audit(actor, "repair_payment", "repair", repairId, { amount }, q);
  });
}

/** Staff set the final charge and (optional, report-only) labour cost. */
export async function setRepairFinance(db: Db, repairId: string, v: { finalCharge?: number | null; laborCost?: number | null }, actor: string): Promise<void> {
  for (const n of [v.finalCharge, v.laborCost]) if (n != null && (!Number.isSafeInteger(n) || n < 0)) throw new FinanceError("Enter amounts in whole rupees.");
  await atomic(db, async (q) => {
    if (await isRecognized(q, repairId) && v.finalCharge !== undefined) throw new FinanceError("This repair is completed and its income is booked. The final charge can no longer be changed.");
    await q.query("update repair_inquiries set final_charge = coalesce($2, final_charge), labor_cost = coalesce($3, labor_cost), updated_at = now() where id = $1", [repairId, v.finalCharge ?? null, v.laborCost ?? null]);
    await audit(actor, "repair_finance_set", "repair", repairId, v as Record<string, unknown>, q);
  });
}

/** Credit repair: customer takes the device now and pays later. */
export async function leaveRepairOnCredit(db: Db, repairId: string, amount: number, dueDate: string | null, actor: string, allowOverLimit = false): Promise<void> {
  await atomic(db, async (q) => {
    const r = (await q.query<{ phone: string; customer_name: string }>("select phone, customer_name from repair_inquiries where id = $1", [repairId]))[0];
    if (!r) throw new FinanceError("Repair not found.");
    const party = await ensureParty(q, { kind: "customer", name: r.customer_name, phone: r.phone });
    await createCreditItem(q, { partyId: party, direction: "receivable", sourceType: "repair", sourceId: repairId, amount, dueDate, allowOverLimit });
    await audit(actor, "repair_on_credit", "repair", repairId, { amount, dueDate }, q);
  });
}

export interface RepairProfit { id: string; reference: string; device: string; charge: number; partsCost: number; directCosts: number; labor: number; profit: number; unknownCostParts: number }
export async function repairProfit(q: Queryable, from: string, to: string): Promise<RepairProfit[]> {
  const rows = await q.query<{ id: string; reference: string; device: string; charge: string | number; parts: string | number; direct: string | number; labor: number | null; unk: string | number }>(
    `select r.id, r.reference, r.device_brand || ' ' || r.device_model as device, coalesce(r.final_charge, r.approved_amount, 0) as charge,
       coalesce((select sum(round(p.quantity * coalesce(p.unit_cost,0))) from repair_parts p where p.repair_id = r.id),0) as parts,
       coalesce((select sum(x.amount) from expenses x where x.repair_id = r.id and x.voided_at is null),0) as direct,
       r.labor_cost as labor,
       coalesce((select sum(p.cost_unknown_qty) from repair_parts p where p.repair_id = r.id),0) as unk
     from repair_inquiries r where r.status = 'completed' and (r.completed_at at time zone 'Asia/Karachi')::date between $1::date and $2::date order by r.completed_at`, [from, to]);
  return rows.map((r) => {
    const [charge, parts, direct] = [Number(r.charge), Number(r.parts), Number(r.direct)];
    const labor = r.labor ?? 0;
    return { id: r.id, reference: r.reference, device: r.device, charge, partsCost: parts, directCosts: direct, labor, profit: charge - parts - direct - labor, unknownCostParts: Number(r.unk) };
  });
}

/** Remove a part that was not used: restocks (at the cost it left with) and reverses nothing silently; the cost entry is reversed by a new journal. */
export async function removeRepairPart(db: Db, partId: string, actor: string): Promise<void> {
  await atomic(db, async (q) => {
    const p = (await q.query<{ id: string; repair_id: string; product_id: string | null; quantity: number; unit_cost: string | null; cost_unknown_qty: number }>("select * from repair_parts where id = $1 for update", [partId]))[0];
    if (!p) return;
    if (p.product_id) await receiveStock(q, p.product_id, p.quantity, p.unit_cost == null ? null : Number(p.unit_cost), "return", { key: `repair-part-remove:${partId}`, refType: "repair", refId: p.repair_id, actor }, p.cost_unknown_qty);
    const j = await q.query<{ id: string }>("select id from fin_journals where idem_key in ($1, $2)", [`repair-part-cogs:${partId}`, `repair-part-cash:${partId}`]);
    for (const x of j) await reverse(q, x.id, actor, "part removed from repair");
    await q.query("delete from repair_parts where id = $1", [partId]);
    await audit(actor, "repair_part_removed", "repair", p.repair_id, { partId }, q);
  });
}
