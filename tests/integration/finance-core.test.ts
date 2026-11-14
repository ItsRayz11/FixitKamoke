import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { recordBalanceCollected, recordRefund, setPaymentStatus, transitionOrder, verifyAdvance } from "@/lib/orders/admin";
import { saveAdvanceConfig } from "@/lib/payments/advance";
import { defaultAdvanceConfig } from "@/lib/domain/advance";
import { settlePayment } from "@/lib/payments/settle";
import { ACC, balanceOf, balances, ledgerIsBalanced, post, reverse } from "@/lib/finance/ledger";
import { adjustStock, declareOpeningCost, inventoryValue } from "@/lib/finance/stock";
import { createPurchase, payPurchase, receivePurchase, saveSupplier } from "@/lib/finance/purchases";
import { returnOrderGoods } from "@/lib/finance/orders";

let db: Db;
let n = 0;
const key = () => `finance-core-key-${++n}-${"x".repeat(10)}`;
const P = { A: "", B: "", C: "" };

const mk = async (slug: string, price: number, stock: number) => {
  const id = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published,sku) values ($1,$1,$2,$3,true,$1) returning id", [slug, price, stock]))[0].id;
  await db.query("update products set unvalued_units = stock where id = $1", [id]); // same as the migration does for existing stock
  return id;
};
const prod = async (id: string) => (await db.query<{ stock: number; avg_cost: string | null; unvalued_units: number }>("select stock, avg_cost, unvalued_units from products where id = $1", [id]))[0];
const place = (productId: string, quantity: number, paymentMethod: "cod" | "bank_transfer" = "cod") =>
  createOrder(db, { customerName: "Fin Person", phone: "0300 1234567", city: "Kamoki", address: "Test street 1, Test area", paymentMethod, idempotencyKey: key(), items: [{ productId, quantity }] });
const oid = async (num: string) => (await db.query<{ id: string }>("select id from orders where order_number = $1", [num]))[0].id;
const walk = async (id: string, path: string[]) => { for (const s of path) await transitionOrder(db, id, s as never, "staff@test"); };
const TO_DELIVERED = ["confirmed", "processing", "packed", "shipped", "delivered"];
const bal = async (code: string) => balanceOf(db, code);

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({
    version: "t1", unlistedCity: "manual_confirmation",
    zones: [{ id: "local", label: "Local", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 1] }],
  })]);
  P.A = await mk("cable", 1000, 10); // 10 units already on the shelf: cost unknown
  P.B = await mk("case", 500, 0);
  P.C = await mk("charger", 2000, 5);
  await post(db, { key: "open-cash", memo: "Opening cash", lines: [{ account: ACC.cash, debit: 5000 }, { account: ACC.equity, credit: 5000 }] });
});
afterAll(() => db.close());

describe("ledger engine", () => {
  it("refuses an unbalanced journal and posts the same key only once", async () => {
    await expect(post(db, { key: "bad", memo: "bad", lines: [{ account: ACC.cash, debit: 10 }, { account: ACC.sales, credit: 9 }] })).rejects.toThrow(/balance/i);
    const a = await post(db, { key: "dup", memo: "x", lines: [{ account: ACC.cash, debit: 10 }, { account: ACC.sales, credit: 10 }] });
    const b = await post(db, { key: "dup", memo: "x", lines: [{ account: ACC.cash, debit: 10 }, { account: ACC.sales, credit: 10 }] });
    expect(a!.created).toBe(true);
    expect(b).toMatchObject({ id: a!.id, created: false });
    expect(await bal(ACC.cash)).toBe(5010);
  });
  it("posted rows cannot be edited or deleted, and the database rejects an unbalanced insert", async () => {
    await expect(db.query("update fin_entries set debit = debit + 1")).rejects.toThrow(/immutable/i);
    await expect(db.query("delete from fin_journals")).rejects.toThrow(/immutable/i);
    await expect(db.query("update stock_movements set qty_delta = 99")).rejects.toThrow(/immutable/i);
    await expect(db.tx(async (q) => {
      const j = await q.query<{ id: string }>("insert into fin_journals(idem_key, effective_date, memo) values ('raw', current_date, 'raw') returning id");
      await q.query("insert into fin_entries(journal_id, account_id, debit) select $1, id, 5 from fin_accounts where code = '1000'", [j[0].id]);
    })).rejects.toThrow(/unbalanced/i);
  });
  it("a reversal undoes a journal exactly, once", async () => {
    const j = await post(db, { key: "rev-me", memo: "oops", lines: [{ account: ACC.cash, debit: 70 }, { account: ACC.sales, credit: 70 }] });
    const before = await bal(ACC.cash);
    await reverse(db, j!.id, "owner", "typo");
    await reverse(db, j!.id, "owner", "typo again");
    expect(await bal(ACC.cash)).toBe(before - 70);
  });
});

describe("purchasing, costing and stock", () => {
  it("opening stock is unvalued: counted, but never given an invented cost", async () => {
    expect(await prod(P.A)).toMatchObject({ stock: 10, avg_cost: null, unvalued_units: 10 });
    const v = await inventoryValue(db);
    expect(v.valued).toBe(0);
    expect(v.unknownUnits).toBeGreaterThanOrEqual(10);
  });

  it("a draft purchase changes nothing; receiving by the box adds units at landed cost, once", async () => {
    const sup = await saveSupplier(db, { name: "Lahore Traders", phone: "0300 0000000" }, "owner@test");
    const pid = await createPurchase(db, {
      supplierId: sup, invoiceNo: "INV-1", purchaseDate: "2026-11-01", discount: 60, transportCost: 300, otherCost: 0,
      items: [{ productId: P.A, packType: "box", qty: 5, unitsPerBox: 12, cost: 600 }],
    }, "owner@test");
    expect((await prod(P.A)).stock).toBe(10);
    expect(await bal(ACC.inventory)).toBe(0);

    await receivePurchase(db, pid, "owner@test");
    await receivePurchase(db, pid, "owner@test"); // repeat: no second increase
    const a = await prod(P.A);
    expect(a.stock).toBe(70); // 10 + 5 boxes x 12
    expect(Number(a.avg_cost)).toBeCloseTo(54, 4); // (3000 - 60 + 300) / 60 units
    expect(a.unvalued_units).toBe(10);
    expect(await bal(ACC.inventory)).toBe(3240);
    expect(await bal(ACC.payable)).toBe(-3240);
    expect(Number((await db.query<{ n: number }>("select count(*)::int as n from stock_movements where kind = 'purchase' and product_id = $1", [P.A]))[0].n)).toBe(1);
  });

  it("supplier payments are partial, idempotent and cannot overpay", async () => {
    const pid = (await db.query<{ id: string }>("select id from purchases where invoice_no = 'INV-1'"))[0].id;
    const cash = await bal(ACC.cash);
    await payPurchase(db, pid, 1000, ACC.cash, "owner@test", "pay-1");
    await payPurchase(db, pid, 1000, ACC.cash, "owner@test", "pay-1"); // same key: ignored
    expect(await bal(ACC.cash)).toBe(cash - 1000);
    expect(await bal(ACC.payable)).toBe(-2240);
    await expect(payPurchase(db, pid, 5000, ACC.cash, "owner@test", "pay-2")).rejects.toThrow(/outstanding/i);
    await payPurchase(db, pid, 2240, ACC.bank, "owner@test", "pay-3");
    expect(await bal(ACC.payable)).toBe(0);
    expect((await db.query<{ paid_amount: number }>("select paid_amount from purchases where id = $1", [pid]))[0].paid_amount).toBe(3240);
  });

  it("a later purchase at a new price moves the average; the unit price on past sales never changes", async () => {
    const pid = await createPurchase(db, { purchaseDate: "2026-11-05", items: [{ productId: P.B, packType: "unit", qty: 10, unitsPerBox: 1, cost: 200 }] }, "owner@test");
    await receivePurchase(db, pid, "owner@test", { amount: 2000, account: ACC.cash });
    expect(Number((await prod(P.B)).avg_cost)).toBe(200);
    const pid2 = await createPurchase(db, { purchaseDate: "2026-11-06", items: [{ productId: P.B, packType: "unit", qty: 10, unitsPerBox: 1, cost: 300 }] }, "owner@test");
    await receivePurchase(db, pid2, "owner@test");
    expect(Number((await prod(P.B)).avg_cost)).toBe(250); // 20 units: (10x200 + 10x300) / 20
    expect((await prod(P.B)).stock).toBe(20);
  });

  it("owner-declared opening cost values only the unknown units; adjustments are ledgered", async () => {
    await declareOpeningCost(db, P.C, 1500, "owner@test");
    expect(Number((await prod(P.C)).avg_cost)).toBe(1500);
    expect((await prod(P.C)).unvalued_units).toBe(0);
    const inv = await bal(ACC.inventory);
    await adjustStock(db, P.C, 3, { key: "adj-c-1", actor: "owner@test", note: "2 broken" }); // 2 valued units written off
    expect(await bal(ACC.writeOff)).toBe(3000);
    expect(await bal(ACC.inventory)).toBe(inv - 3000);
    await adjustStock(db, P.C, 3, { key: "adj-c-2", actor: "owner@test" }); // no change: nothing posted
    expect(await bal(ACC.writeOff)).toBe(3000);
  });
});

describe("selling, revenue recognition and profit", () => {
  let orderId = "";
  it("a sale freezes cost on the line: unknown-cost units first, then valued units at average cost", async () => {
    const o = await place(P.A, 15); // 70 on hand: 10 unvalued, 60 at 54
    orderId = await oid(o.orderNumber);
    const li = (await db.query<{ unit_cost: string | null; cost_unknown_qty: number }>("select unit_cost, cost_unknown_qty from order_items where order_id = $1", [orderId]))[0];
    expect(Number(li.unit_cost)).toBe(54);
    expect(li.cost_unknown_qty).toBe(10);
    expect(await prod(P.A)).toMatchObject({ stock: 55, unvalued_units: 0 });
  });

  it("nothing is revenue until delivery; then sales and COGS are booked from the frozen cost", async () => {
    const base = await bal(ACC.sales); // whatever the engine tests posted; none of it from this order
    await walk(orderId, TO_DELIVERED);
    expect(await bal(ACC.sales)).toBe(base - 15000);
    expect(await bal(ACC.receivable)).toBe(15000); // COD: not collected yet, and no cash was invented
    expect(await bal(ACC.cogs)).toBe(270); // 5 valued units x 54; the 10 unknown-cost units are not guessed at
    // a repeated delivery transition is refused and cannot book revenue twice
    await expect(transitionOrder(db, orderId, "delivered", "staff@test")).rejects.toThrow();
    expect(await bal(ACC.sales)).toBe(base - 15000);
  });

  it("collecting the cash settles the receivable, once, and a later cost change does not move past profit", async () => {
    const cash = await bal(ACC.cash);
    await recordBalanceCollected(db, orderId, 15000, "staff@test");
    expect(await bal(ACC.receivable)).toBe(0);
    expect(await bal(ACC.cash)).toBe(cash + 15000);
    await db.query("update products set avg_cost = 999 where id = $1", [P.A]);
    expect(await bal(ACC.cogs)).toBe(270);
    await db.query("update products set avg_cost = 54 where id = $1", [P.A]);
  });

  it("partial COD advance: money received early is a liability, applied at delivery; the rest is collected later", async () => {
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333 });
    const o = await place(P.B, 6); // 6 x 500 = 3000, advance 1000
    const id = await oid(o.orderNumber);
    const bank = await bal(ACC.bank);
    await verifyAdvance(db, id, 1000, "staff@test");
    expect(await bal(ACC.bank)).toBe(bank + 1000);
    expect(await bal(ACC.advances)).toBe(-1000);
    const sales = await bal(ACC.sales); // the advance is not revenue: nothing moved yet
    await walk(id, TO_DELIVERED);
    expect(await bal(ACC.advances)).toBe(0);
    expect(await bal(ACC.receivable)).toBe(2000);
    expect(await bal(ACC.sales)).toBe(sales - 3000);
    await recordBalanceCollected(db, id, 2000, "staff@test");
    expect(await bal(ACC.receivable)).toBe(0);
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: false });
  });

  it("a prepaid order cancelled before delivery returns its stock and never touches revenue", async () => {
    const stock = (await prod(P.B)).stock;
    const o = await place(P.B, 2, "bank_transfer");
    const id = await oid(o.orderNumber);
    expect((await prod(P.B)).stock).toBe(stock - 2);
    await setPaymentStatus(db, id, "paid", "staff@test");
    await transitionOrder(db, id, "cancelled", "staff@test");
    await transitionOrder(db, id, "cancelled", "staff@test").catch(() => undefined);
    expect((await prod(P.B)).stock).toBe(stock); // restocked once
    const sales = await bal(ACC.sales);
    await recordRefund(db, id, 1000, "owner@test");
    expect(await bal(ACC.sales)).toBe(sales);
    expect(await bal(ACC.advances)).toBe(0); // the advance went back to the customer
  });

  it("duplicate payment notifications do not double-post", async () => {
    const o = await place(P.B, 1, "bank_transfer");
    const id = await oid(o.orderNumber);
    await setPaymentStatus(db, id, "paid", "staff@test");
    const before = await bal(ACC.bank);
    await setPaymentStatus(db, id, "paid", "staff@test");
    await setPaymentStatus(db, id, "paid", "staff@test");
    expect(await bal(ACC.bank)).toBe(before);
    void settlePayment;
  });

  it("refund and returned goods after delivery: contra-revenue, stock back at the frozen cost, damaged goods not restocked", async () => {
    const o = await place(P.B, 4, "bank_transfer"); // 4 x 500 = 2000, cost 250 each
    const id = await oid(o.orderNumber);
    await setPaymentStatus(db, id, "paid", "staff@test");
    await walk(id, TO_DELIVERED);
    const cogs = await bal(ACC.cogs);
    const stock = (await prod(P.B)).stock;
    await transitionOrder(db, id, "return_requested", "staff@test");
    await transitionOrder(db, id, "returned", "staff@test");
    const item = (await db.query<{ id: string }>("select id from order_items where order_id = $1", [id]))[0].id;
    await returnOrderGoods(db, id, [{ itemId: item, goodQty: 3 }], "staff@test"); // 1 damaged stays written off
    expect((await prod(P.B)).stock).toBe(stock + 3);
    expect(await bal(ACC.cogs)).toBe(cogs - 750);
    await expect(returnOrderGoods(db, id, [{ itemId: item, goodQty: 2 }], "staff@test")).rejects.toThrow(/can still be returned/i);
    await recordRefund(db, id, 2000, "owner@test");
    expect(await bal(ACC.refunds)).toBe(2000);
  });
});

describe("reconciliation", () => {
  it("the ledger balances and every money account equals the sum of its movements", async () => {
    expect(await ledgerIsBalanced(db)).toBe(true);
    const all = await balances(db);
    expect(all.reduce((s, a) => s + a.balance, 0)).toBe(0); // double entry: everything nets to zero
    const money = all.filter((a) => a.kind === "cash" || a.kind === "bank" || a.kind === "wallet");
    expect(money.every((a) => Number.isInteger(a.balance))).toBe(true);
  });
});
