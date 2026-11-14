import type { Queryable } from "@/lib/db";
import type { Db } from "@/lib/db";
import { ACC, FinanceError, atomic, post } from "./ledger";

export type MovementKind = "opening" | "purchase" | "sale" | "sale_cancel" | "return" | "repair_use" | "pos_sale" | "adjustment" | "purchase_return";

interface P { stock: number; avg_cost: string | number | null; unvalued_units: number }
const lock = async (q: Queryable, productId: string): Promise<P> => {
  const r = await q.query<P>("select stock, avg_cost, unvalued_units from products where id = $1 for update", [productId]);
  if (!r[0]) throw new FinanceError("Product not found.");
  return r[0];
};
const round2 = (n: number) => Math.round(n * 10000) / 10000;

export interface Issue {
  /** Average cost at the moment of issue; null when unknown. */
  unitCost: number | null;
  /** How many of the issued units had no known cost (reported as "cost unknown", never guessed). */
  unknownQty: number;
  valuedQty: number;
}
export interface MoveCtx { key: string; refType?: string; refId?: string; actor?: string; note?: string }

/** Insert a ledger row once. Returns false when this key was already recorded (a repeat), in which case callers must do nothing. */
async function record(q: Queryable, productId: string, kind: MovementKind, qty: number, unitCost: number | null, c: MoveCtx): Promise<boolean> {
  const r = await q.query(
    `insert into stock_movements(product_id, kind, qty_delta, unit_cost, ref_type, ref_id, idem_key, note, actor)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (idem_key) do nothing returning id`,
    [productId, kind, qty, unitCost, c.refType ?? null, c.refId ?? null, c.key, c.note ?? null, c.actor ?? null]);
  return r.length > 0;
}

/**
 * Units leave stock (sale, POS sale, repair part, write-off). Unvalued (opening, unknown-cost) units are used first.
 * `apply: false` is for flows that already changed products.stock themselves (online checkout); this only records and costs it.
 * Returns null if this key was already applied.
 */
export async function issueStock(q: Queryable, productId: string, qty: number, kind: MovementKind, c: MoveCtx, apply = true): Promise<Issue | null> {
  if (!Number.isSafeInteger(qty) || qty <= 0) throw new FinanceError("Quantity must be a positive whole number.");
  const p = await lock(q, productId);
  const avg = p.avg_cost == null ? null : Number(p.avg_cost);
  if (!(await record(q, productId, kind, -qty, avg, c))) return null;
  if (apply) {
    const ok = await q.query("update products set stock = stock - $2, updated_at = now() where id = $1 and stock >= $2 returning id", [productId, qty]);
    if (!ok[0]) throw new FinanceError("Not enough stock.");
  }
  const unknown = Math.min(qty, p.unvalued_units);
  let valued = qty - unknown;
  let unknownQty = unknown;
  if (valued > 0 && avg == null) { unknownQty += valued; valued = 0; } // defensive: valued units with no average cost are reported as unknown
  if (unknown > 0) await q.query("update products set unvalued_units = unvalued_units - $2 where id = $1", [productId, unknown]);
  return { unitCost: avg, unknownQty, valuedQty: valued };
}

/**
 * Units arrive at a known cost per unit (purchase, or a return at the cost it left with): moving weighted-average cost.
 * Units that came back as "unknown cost" go back to the unvalued pool instead.
 */
export async function receiveStock(q: Queryable, productId: string, qty: number, unitCost: number | null, kind: MovementKind, c: MoveCtx, unknownQty = 0): Promise<boolean> {
  if (!Number.isSafeInteger(qty) || qty <= 0) throw new FinanceError("Quantity must be a positive whole number.");
  const p = await lock(q, productId);
  if (!(await record(q, productId, kind, qty, unitCost, c))) return false;
  const unk = Math.min(Math.max(unknownQty, 0), qty);
  const known = qty - unk;
  const valuedBefore = Math.max(0, p.stock - p.unvalued_units);
  const avg = p.avg_cost == null ? null : Number(p.avg_cost);
  let newAvg = avg;
  if (known > 0 && unitCost != null) {
    newAvg = avg == null || valuedBefore === 0 ? unitCost : round2((valuedBefore * avg + known * unitCost) / (valuedBefore + known));
  }
  await q.query("update products set stock = stock + $2, avg_cost = $3, unvalued_units = unvalued_units + $4, updated_at = now() where id = $1",
    [productId, qty, newAvg, unk + (unitCost == null ? known : 0)]);
  return true;
}

/**
 * Staff set an exact shelf quantity. A decrease is a write-off (valued units at average cost go to "Inventory adjustments"),
 * an increase adds unvalued units. Replaces the bare `update products set stock` so every change is in the ledger.
 */
export async function adjustStock(q0: Queryable | Db, productId: string, newQty: number, c: MoveCtx): Promise<void> {
  return atomic(q0, (q) => adjustStockIn(q, productId, newQty, c));
}
async function adjustStockIn(q: Queryable, productId: string, newQty: number, c: MoveCtx): Promise<void> {
  if (!Number.isSafeInteger(newQty) || newQty < 0) throw new FinanceError("Stock must be zero or more.");
  const p = await lock(q, productId);
  if (newQty === p.stock) return;
  await q.query("update products set stock = $2, updated_at = now() where id = $1", [productId, newQty]);
  await ledgerStockChange(q, productId, newQty - p.stock, c);
}

/**
 * Records a stock change that the caller has ALREADY applied to products.stock (product form, adjustment). A decrease is a write-off
 * (valued units at average cost go to "Inventory adjustments"); an increase adds unvalued units.
 */
export async function ledgerStockChange(q: Queryable, productId: string, delta: number, c: MoveCtx): Promise<void> {
  if (delta === 0) return;
  if (delta < 0) {
    const out = await issueStock(q, productId, -delta, "adjustment", c, false);
    if (out && out.valuedQty > 0 && out.unitCost != null) {
      await post(q, { key: `${c.key}:writeoff`, memo: "Stock adjustment (write-off)", refType: "product", refId: productId, actor: c.actor,
        lines: [{ account: ACC.writeOff, debit: Math.round(out.valuedQty * out.unitCost) }, { account: ACC.inventory, credit: Math.round(out.valuedQty * out.unitCost) }] });
    }
    return;
  }
  if (!(await record(q, productId, delta > 0 && c.key.endsWith(":initial") ? "opening" : "adjustment", delta, null, c))) return;
  await q.query("update products set unvalued_units = unvalued_units + $2 where id = $1", [productId, delta]);
}

/**
 * The owner declares what the unknown-cost opening units cost. Explicit and audited by the caller; it is the owner's statement,
 * not something the system guesses. Books Inventory against Owner equity.
 */
export async function declareOpeningCost(q0: Queryable | Db, productId: string, unitCost: number, actor: string, qty?: number): Promise<number> {
  return atomic(q0, (q) => declareOpeningCostIn(q, productId, unitCost, actor, qty));
}
async function declareOpeningCostIn(q: Queryable, productId: string, unitCost: number, actor: string, qty?: number): Promise<number> {
  if (!(unitCost >= 0) || !Number.isFinite(unitCost)) throw new FinanceError("Enter the cost per unit.");
  const p = await lock(q, productId);
  const n = Math.min(qty ?? p.unvalued_units, p.unvalued_units);
  if (n <= 0) throw new FinanceError("There are no unknown-cost units for this product.");
  const valuedBefore = Math.max(0, p.stock - p.unvalued_units);
  const avg = p.avg_cost == null ? null : Number(p.avg_cost);
  const newAvg = avg == null || valuedBefore === 0 ? unitCost : round2((valuedBefore * avg + n * unitCost) / (valuedBefore + n));
  await q.query("update products set avg_cost = $2, unvalued_units = unvalued_units - $3 where id = $1", [productId, newAvg, n]);
  await post(q, { key: `opencost:${productId}:${p.unvalued_units}`, memo: "Opening inventory cost declared by owner", refType: "product", refId: productId, actor,
    lines: [{ account: ACC.inventory, debit: Math.round(n * unitCost) }, { account: ACC.equity, credit: Math.round(n * unitCost) }] });
  return n;
}

export interface InventoryValue { valued: number; unknownUnits: number; products: number; productsWithUnknown: number }
/** Stock on hand valued at moving-average cost; units with unknown cost are counted separately, never valued. */
export async function inventoryValue(q: Queryable): Promise<InventoryValue> {
  const r = await q.query<{ v: string | number | null; u: string | number | null; n: string | number; pu: string | number }>(
    `select sum(greatest(stock - unvalued_units, 0) * avg_cost) as v, sum(least(unvalued_units, stock)) as u, count(*) as n,
            count(*) filter (where unvalued_units > 0 and stock > 0) as pu from products where stock > 0`);
  const x = r[0];
  return { valued: Math.round(Number(x.v ?? 0)), unknownUnits: Number(x.u ?? 0), products: Number(x.n), productsWithUnknown: Number(x.pu) };
}
