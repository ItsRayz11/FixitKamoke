import crypto from "node:crypto";
import { getAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { moneyAccounts } from "@/lib/finance/ledger";
import { can, permsFor } from "@/lib/finance/perms-core";
import { repairPartAction, removeRepairPartAction, repairFinanceAction, repairPaymentAction } from "@/app/admin/(panel)/finance/actions";
import { rs, selectCls } from "./finance-ui";
import { Card, Field, inputCls, Submit, td, th } from "./ui";

/** The money side of one repair: parts used, what the customer has paid, and the final charge. Shown to anyone who may use the counter. */
export async function RepairMoney({ repairId }: { repairId: string }) {
  const admin = await getAdmin();
  if (!admin) return null;
  const db = await getDb();
  const granted = (await db.query<{ finance_perms: string[] }>("select finance_perms from admin_users where id = $1", [admin.id]))[0]?.finance_perms ?? [];
  const me = { role: admin.role, perms: permsFor(admin.role, granted) };
  if (!can(me, "pos")) return null;
  const costs = can(me, "finance_costs"); const write = can(me, "finance_write");
  const [r, parts, pays, accounts, products] = await Promise.all([
    db.query<{ status: string; final_charge: number | null; approved_amount: number | null; labor_cost: number | null }>("select status, final_charge, approved_amount, labor_cost from repair_inquiries where id = $1", [repairId]),
    db.query<{ id: string; description: string; quantity: number; unit_cost: string | null; cost_unknown_qty: number }>("select id, description, quantity, unit_cost, cost_unknown_qty from repair_parts where repair_id = $1 order by created_at", [repairId]),
    db.query<{ amount: number; created_at: string }>("select amount, created_at::text from repair_payments where repair_id = $1 order by created_at", [repairId]),
    moneyAccounts(db),
    db.query<{ id: string; name: string; stock: number }>("select id, name, stock from products where stock > 0 order by name limit 800"),
  ]);
  const rep = r[0]; if (!rep) return null;
  const charge = rep.final_charge ?? rep.approved_amount ?? 0;
  const paid = pays.reduce((s, p) => s + p.amount, 0);
  const done = rep.status === "completed";
  const k1 = crypto.randomUUID(); const k2 = crypto.randomUUID(); const k3 = crypto.randomUUID();
  return (
    <div className="mt-6"><Card title="Money, parts and payments" id="repair-money">
      <p className="mt-1 text-sm text-muted">Charge {rs(charge)} · paid {rs(paid)} · {charge - paid > 0 ? <span className="font-semibold text-warn">{rs(charge - paid)} still to pay</span> : "fully paid"}. Income is booked when the repair is marked Completed.</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full"><thead className="border-b border-line"><tr><th className={th}>Part</th><th className={th}>Qty</th>{costs && <th className={th}>Cost each</th>}<th className={th}></th></tr></thead>
        <tbody className="divide-y divide-line">{parts.length === 0 && <tr><td className={td} colSpan={4}>No parts recorded.</td></tr>}
          {parts.map((p) => (
            <tr key={p.id}><td className={td}>{p.description}</td><td className={td}>{p.quantity}</td>{costs && <td className={td}>{p.unit_cost == null ? "unknown" : rs(Number(p.unit_cost))}{p.cost_unknown_qty > 0 && p.unit_cost != null && <span className="text-xs text-warn"> ({p.cost_unknown_qty} unit(s) of unknown cost)</span>}</td>}
              <td className={td}>{write && !done && <form action={removeRepairPartAction}><input type="hidden" name="repairId" value={repairId} /><input type="hidden" name="id" value={p.id} /><button className="min-h-11 text-sm underline">Remove</button></form>}</td></tr>
          ))}</tbody></table></div>
      {!done && (
        <form action={repairPartAction} className="mt-3 grid gap-2 rounded bg-canvas p-3 sm:grid-cols-[1fr_80px_auto]">
          <input type="hidden" name="repairId" value={repairId} /><input type="hidden" name="key" value={k1} />
          <select name="product" aria-label="Part from stock" className={selectCls}><option value="">Part bought outside (not from stock)</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.stock} in stock</option>)}</select>
          <input name="quantity" inputMode="numeric" defaultValue={1} aria-label="Quantity" className={inputCls} />
          <Submit>Add part</Submit>
          <input name="description" placeholder="Outside part: what is it?" aria-label="Outside part description" className={`${inputCls} sm:col-span-1`} />
          <input name="cost" inputMode="decimal" placeholder="Cost each (outside part)" aria-label="Cost of an outside part" className={inputCls} />
          <select name="account" aria-label="Paid for the outside part from" className={selectCls}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select>
        </form>
      )}
      <form action={repairPaymentAction} className="mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="repairId" value={repairId} /><input type="hidden" name="key" value={k2} />
        <Field label="Customer paid (Rs.)" id="rp-a"><input id="rp-a" name="amount" inputMode="numeric" required className={inputCls} /></Field>
        <Field label="Into" id="rp-c"><select id="rp-c" name="account" className={selectCls}>{accounts.map((a) => <option key={a.id} value={a.code}>{a.name}</option>)}</select></Field>
        <Submit>Record payment</Submit>
      </form>
      {pays.length > 0 && <ul className="mt-2 text-sm text-muted">{pays.map((p, i) => <li key={i}>{rs(p.amount)} on {p.created_at.slice(0, 10)}</li>)}</ul>}
      {write && (
        <form action={repairFinanceAction} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="repairId" value={repairId} /><input type="hidden" name="key" value={k3} />
          {!done && <Field label="Final charge (Rs.)" id="rf-c" hint="Leave empty to use the approved price."><input id="rf-c" name="charge" inputMode="numeric" defaultValue={rep.final_charge ?? ""} className={inputCls} /></Field>}
          {costs && <Field label="Labour cost (Rs.)" id="rf-l" hint="For the repair profit report only."><input id="rf-l" name="labor" inputMode="numeric" defaultValue={rep.labor_cost ?? ""} className={inputCls} /></Field>}
          <Submit>Save</Submit>
        </form>
      )}
    </Card></div>
  );
}
