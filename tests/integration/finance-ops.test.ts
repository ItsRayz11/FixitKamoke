import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { updateRepair } from "@/lib/repairs/repairs";
import { ACC, balanceOf, balances, ledgerIsBalanced, post } from "@/lib/finance/ledger";
import { createMoneyAccount, ownerMovement, reconcile, setOpeningBalance, transfer } from "@/lib/finance/accounts";
import { addExpense, expensesByCategory, runRecurring, saveTemplate, voidExpense } from "@/lib/finance/expenses";
import { addService, computeFee, voidService } from "@/lib/finance/services";
import { ringUpSale, voidPosSale } from "@/lib/finance/pos";
import { aging, payCredit, setCreditLimit, CreditLimitError } from "@/lib/finance/credit";
import { addRepairPart, recordRepairPayment, repairProfit, setRepairFinance } from "@/lib/finance/repairs";
import { closeDay, computeClosing, correctClosing } from "@/lib/finance/closing";
import { overview, profitAndLoss, profitSeries, salesReport, cashCollection, inventoryValuation, productProfitability } from "@/lib/finance/reports";
import { toCsv, toExcelXml } from "@/lib/finance/export";
import { createPurchase, receivePurchase } from "@/lib/finance/purchases";
import { can, permsFor } from "@/lib/finance/perms-core";

let db: Db;
let n = 0;
const k = (p = "k") => `${p}-${++n}-${"x".repeat(8)}`;
const bal = (code: string) => balanceOf(db, code);
let phone = "";
const TODAY = new Date().toISOString().slice(0, 10);

const mk = async (slug: string, price: number, stock: number) => {
  const id = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published,sku) values ($1,$1,$2,$3,true,$1) returning id", [slug, price, stock]))[0].id;
  await db.query("update products set unvalued_units = stock where id = $1", [id]);
  return id;
};
const buyIn = async (productId: string, qty: number, cost: number) => {
  const id = await createPurchase(db, { purchaseDate: "2026-11-01", items: [{ productId, packType: "unit", qty, unitsPerBox: 1, cost }] }, "owner@test");
  await receivePurchase(db, id, "owner@test");
};
const stock = async (id: string) => (await db.query<{ stock: number }>("select stock from products where id = $1", [id]))[0].stock;
let SCREEN = "", CASE = "";

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await setOpeningBalance(db, ACC.cash, 10000, undefined, "owner@test");
  await setOpeningBalance(db, ACC.jazzcash, 50000, undefined, "owner@test");
  SCREEN = await mk("screen", 3000, 0);
  CASE = await mk("case2", 800, 0);
  await buyIn(SCREEN, 10, 1800);
  await buyIn(CASE, 20, 300);
  phone = "0300 7654321";
});
afterAll(() => db.close());

describe("accounts", () => {
  it("opening balance is a ledger entry (once), a new account can be added, and transfers move money without income or expense", async () => {
    await expect(setOpeningBalance(db, ACC.cash, 99, undefined, "owner@test")).resolves.toBeUndefined(); // second call: same key, ignored
    expect(await bal(ACC.cash)).toBe(10000);
    const bank2 = await createMoneyAccount(db, { name: "Meezan Bank", kind: "bank", openingBalance: 20000 }, "owner@test");
    expect(await bal(bank2)).toBe(20000);
    const pl = await profitAndLoss(db, "2000-01-01", "2100-01-01");
    await transfer(db, { from: ACC.jazzcash, to: bank2, amount: 5000, key: "t1" }, "owner@test");
    await transfer(db, { from: ACC.jazzcash, to: bank2, amount: 5000, key: "t1" }, "owner@test"); // double click
    expect(await bal(bank2)).toBe(25000);
    expect(await bal(ACC.jazzcash)).toBe(45000);
    expect(await profitAndLoss(db, "2000-01-01", "2100-01-01")).toMatchObject({ netProfit: pl.netProfit, grossSales: pl.grossSales });
    await expect(transfer(db, { from: ACC.cash, to: ACC.cash, amount: 1, key: "t2" }, "owner@test")).rejects.toThrow();
    await ownerMovement(db, { account: ACC.cash, direction: "in", amount: 500, key: "o1" }, "owner@test");
    await ownerMovement(db, { account: ACC.cash, direction: "out", amount: 500, key: "o2" }, "owner@test");
    expect(await bal(ACC.cash)).toBe(10000);
  });
  it("reconciliation posts the difference openly, with a reason", async () => {
    await expect(reconcile(db, { account: ACC.cash, actualBalance: 9900, reason: " ", key: "r0" }, "owner@test")).rejects.toThrow(/reason/i);
    expect(await reconcile(db, { account: ACC.cash, actualBalance: 9900, reason: "short by 100", key: "r1" }, "owner@test")).toBe(-100);
    expect(await bal(ACC.cash)).toBe(9900);
    expect(await bal("5200")).toBe(100);
    await ownerMovement(db, { account: ACC.cash, direction: "in", amount: 100, key: "o3" }, "owner@test");
    await post(db, { key: "undo-diff", memo: "settle difference", lines: [{ account: ACC.equity, debit: 100 }, { account: "5200", credit: 100 }] });
  });
});

describe("walk-in counter sales", () => {
  it("sells existing stock, freezes cost, and refuses to oversell", async () => {
    const stockBefore = await stock(SCREEN);
    const cash = await bal(ACC.cash);
    const r = await ringUpSale(db, { items: [{ productId: SCREEN, quantity: 2 }], discount: 200 }, "staff@test", "sale-1");
    expect(r).toMatchObject({ total: 5800, credit: 0, duplicate: false });
    expect(await stock(SCREEN)).toBe(stockBefore - 2);
    expect(await bal(ACC.cash)).toBe(cash + 5800);
    expect(await bal(ACC.cogs)).toBe(3600); // 2 x 1800
    const again = await ringUpSale(db, { items: [{ productId: SCREEN, quantity: 2 }], discount: 200 }, "staff@test", "sale-1"); // double click
    expect(again.duplicate).toBe(true);
    expect(await stock(SCREEN)).toBe(stockBefore - 2);
    await expect(ringUpSale(db, { items: [{ productId: SCREEN, quantity: 99 }] }, "staff@test", "sale-2")).rejects.toThrow(/Not enough stock/);
    expect(await stock(SCREEN)).toBe(stockBefore - 2); // failed sale left nothing behind
  });

  it("a credit sale raises receivables and sales but no cash; limits need owner approval; repayment is partial and aging works", async () => {
    const cash = await bal(ACC.cash);
    const sales = await bal(ACC.sales);
    const r = await ringUpSale(db, { items: [{ productId: CASE, quantity: 5 }], paid: 1000, customerName: "Bilal", customerPhone: phone, dueDate: "2026-01-01" }, "staff@test", "sale-3");
    expect(r.credit).toBe(3000);
    expect(await bal(ACC.cash)).toBe(cash + 1000); // only what was paid
    expect(await bal(ACC.sales)).toBe(sales - 4000);
    expect(await bal(ACC.receivable)).toBe(3000);
    await expect(ringUpSale(db, { items: [{ productId: CASE, quantity: 1 }], paid: 0 }, "staff@test", "sale-4")).rejects.toThrow(/name or phone/i);

    const party = (await db.query<{ id: string }>("select id from credit_parties where phone = $1", [phone]))[0].id;
    await setCreditLimit(db, party, 3500, "owner@test");
    await expect(ringUpSale(db, { items: [{ productId: CASE, quantity: 1 }], paid: 0, customerPhone: phone }, "staff@test", "sale-5")).rejects.toBeInstanceOf(CreditLimitError);
    const over = await ringUpSale(db, { items: [{ productId: CASE, quantity: 1 }], paid: 0, customerPhone: phone, allowOverLimit: true }, "owner@test", "sale-6"); // owner approved
    expect(over.credit).toBe(800);

    const item = (await db.query<{ id: string }>("select id from credit_items where source_id = $1", [r.id]))[0].id;
    await payCredit(db, item, 1200, ACC.cash, "staff@test", "cp-1");
    await payCredit(db, item, 1200, ACC.cash, "staff@test", "cp-1"); // duplicate ignored
    expect(await bal(ACC.receivable)).toBe(3000 + 800 - 1200);
    await expect(payCredit(db, item, 5000, ACC.cash, "staff@test", "cp-2")).rejects.toThrow(/outstanding/i);
    const a = await aging(db, "receivable");
    expect(a.find((x) => x.name === "Bilal")!.d90plus).toBe(1800); // that item was due long ago; the other credit item has no due date
    await payCredit(db, item, 1800, ACC.cash, "staff@test", "cp-3");
    expect((await db.query<{ status: string }>("select status from credit_items where id = $1", [item]))[0].status).toBe("settled");
  });

  it("voiding a sale puts the stock back at its cost and reverses the money", async () => {
    const s0 = await stock(CASE);
    const cash = await bal(ACC.cash);
    const r = await ringUpSale(db, { items: [{ productId: CASE, quantity: 2 }] }, "staff@test", "sale-7");
    await voidPosSale(db, r.id, "owner@test", "wrong item");
    await voidPosSale(db, r.id, "owner@test", "again");
    expect(await stock(CASE)).toBe(s0);
    expect(await bal(ACC.cash)).toBe(cash);
  });
});

describe("wallet services and miscellaneous income", () => {
  it("fixed and percentage fees; principal is never revenue", async () => {
    expect(computeFee("percent", 1.5, 10000)).toBe(150);
    expect(computeFee("fixed", 30, 99999)).toBe(30);
    const income0 = await bal(ACC.serviceIncome);
    const cash = await bal(ACC.cash); const jc = await bal(ACC.jazzcash);
    // deposit: customer pays 10,000 + 1.5% fee in cash; the shop sends 10,000 from its JazzCash
    const id = await addService(db, { kind: "wallet_deposit", principal: 10000, feeMode: "percent", feeValue: 1.5, walletAccount: ACC.jazzcash }, "staff@test", "svc-1");
    await addService(db, { kind: "wallet_deposit", principal: 10000, feeMode: "percent", feeValue: 1.5, walletAccount: ACC.jazzcash }, "staff@test", "svc-1"); // duplicate
    expect(await bal(ACC.cash)).toBe(cash + 10150);
    expect(await bal(ACC.jazzcash)).toBe(jc - 10000);
    expect(await bal(ACC.serviceIncome)).toBe(income0 - 150);
    // withdrawal: shop pays 4,000 cash, wallet gains 4,000; Rs. 40 fee collected
    await addService(db, { kind: "wallet_withdrawal", principal: 4000, feeMode: "fixed", feeValue: 40, walletAccount: ACC.easypaisa }, "staff@test", "svc-2");
    expect(await bal(ACC.cash)).toBe(cash + 10150 - 4000 + 40);
    expect(await bal(ACC.easypaisa)).toBe(4000);
    expect(await bal(ACC.serviceIncome)).toBe(income0 - 190);
    await addService(db, { kind: "recharge", principal: 500, feeMode: "fixed", feeValue: 20, walletAccount: ACC.jazzcash }, "staff@test", "svc-3");
    await addService(db, { kind: "misc_income", feeMode: "fixed", feeValue: 250, note: "phone unlocking" }, "staff@test", "svc-4");
    expect(await bal(ACC.serviceIncome)).toBe(income0 - 190 - 20 - 250);
    await voidService(db, id, "owner@test", "mistake");
    await voidService(db, id, "owner@test", "mistake");
    expect(await bal(ACC.serviceIncome)).toBe(income0 - 190 - 20 - 250 + 150);
    await expect(addService(db, { kind: "wallet_deposit", principal: 100, walletAccount: undefined }, "s", "svc-5")).rejects.toThrow(/wallet/i);
  });
});

describe("expenses", () => {
  it("records an expense once, groups by category, supports recurring templates exactly once, and voids by reversal", async () => {
    const cash = await bal(ACC.cash);
    const e = await addExpense(db, { date: TODAY, category: "6020", payAccount: ACC.cash, amount: 4200, description: "Electricity bill" }, "owner@test", "ex-1");
    expect(await addExpense(db, { date: TODAY, category: "6020", payAccount: ACC.cash, amount: 4200, description: "Electricity bill" }, "owner@test", "ex-1")).toBe(e);
    expect(await bal(ACC.cash)).toBe(cash - 4200);
    await expect(addExpense(db, { date: TODAY, category: ACC.sales, payAccount: ACC.cash, amount: 5 }, "o", "ex-2")).rejects.toThrow(/category/i);

    const tpl = await saveTemplate(db, { name: "Shop rent", category: "6010", payAccount: ACC.cash, amount: 30000, dayOfMonth: 1 }, "owner@test");
    const month = TODAY.slice(0, 7);
    expect(await runRecurring(db, month, TODAY, "system")).toBe(1);
    expect(await runRecurring(db, month, TODAY, "system")).toBe(0); // never twice
    expect(await runRecurring(db, month, TODAY, "system")).toBe(0);
    expect((await db.query<{ n: number }>("select count(*)::int as n from expenses where template_id = $1", [tpl]))[0].n).toBe(1);
    const cat = await expensesByCategory(db, "2000-01-01", "2100-01-01");
    expect(Number(cat.find((c) => c.code === "6010")!.total)).toBe(30000);

    await voidExpense(db, e, "owner@test", "duplicate bill");
    await voidExpense(db, e, "owner@test", "again");
    expect(await bal(ACC.cash)).toBe(cash - 30000);
    expect(Number((await expensesByCategory(db, "2000-01-01", "2100-01-01")).find((c) => c.code === "6020")!.total)).toBe(0);
  });
});

describe("repairs", () => {
  it("parts from stock and bought outside, an advance, completion booking income once, and repair profit", async () => {
    const repair = (await db.query<{ id: string }>(
      `insert into repair_inquiries(reference, tracking_token_hash, customer_name, phone, device_brand, device_model, issue, status, estimate_amount, approved_amount, approved_at)
       values ('RP-1','h-1','Sara','0301 1111111','Samsung','A10','cracked screen','ready',4500,4500,now()) returning id`))[0].id;
    const s0 = await stock(SCREEN);
    const partId = crypto.randomUUID();
    await addRepairPart(db, repair, { productId: SCREEN, quantity: 1 }, "staff@test", partId);
    await addRepairPart(db, repair, { productId: SCREEN, quantity: 1 }, "staff@test", partId); // same key: ignored
    expect(await stock(SCREEN)).toBe(s0 - 1);
    await addRepairPart(db, repair, { description: "Adhesive kit", quantity: 1, unitCost: 150, payAccount: ACC.cash }, "staff@test", crypto.randomUUID());
    await expect(addRepairPart(db, repair, { description: "Mystery part", quantity: 1 }, "staff@test", crypto.randomUUID())).rejects.toThrow(/cost/i);

    await recordRepairPayment(db, repair, 1500, ACC.cash, "staff@test", "rp-1"); // advance: a liability, not income
    await recordRepairPayment(db, repair, 1500, ACC.cash, "staff@test", "rp-1");
    expect(await bal(ACC.advances)).toBe(-1500);
    const income = await bal(ACC.repairIncome);
    const receivableBefore = await bal(ACC.receivable); // unrelated unpaid credit sale from earlier
    await setRepairFinance(db, repair, { laborCost: 300 }, "owner@test");
    await updateRepair(db, repair, { to: "completed" }, "staff@test");
    expect(await bal(ACC.repairIncome)).toBe(income - 4500);
    expect(await bal(ACC.advances)).toBe(0);
    await recordRepairPayment(db, repair, 3000, ACC.cash, "staff@test", "rp-2"); // the balance settles the receivable
    expect(await bal(ACC.receivable)).toBe(receivableBefore); // the repair's own receivable is fully settled
    await expect(setRepairFinance(db, repair, { finalCharge: 9999 }, "owner@test")).rejects.toThrow(/completed/i);

    const [p] = await repairProfit(db, "2000-01-01", "2100-01-01");
    expect(p).toMatchObject({ reference: "RP-1", charge: 4500, partsCost: 1950, labor: 300, profit: 4500 - 1950 - 300 });
  });
});

describe("daily closing", () => {
  it("computes expected cash, posts any difference, finalises once, and corrections need a reason and are auditable", async () => {
    await ownerMovement(db, { account: ACC.cash, direction: "in", amount: 200000, key: "float" }, "owner@test"); // cash had gone negative from the rent test
    const f = await computeClosing(db, TODAY);
    const expected = await bal(ACC.cash);
    expect(f.expected).toBe(expected);
    const id = await closeDay(db, { date: TODAY, counted: expected - 250, note: "drawer short" }, "staff@test");
    expect(await bal(ACC.cash)).toBe(expected - 250);
    await expect(closeDay(db, { date: TODAY, counted: 1 }, "staff@test")).rejects.toThrow(/already closed/i);
    await expect(correctClosing(db, id, expected, " ", "owner@test")).rejects.toThrow(/reason/i);
    const fixed = await correctClosing(db, id, expected, "found the missing 250 in the till", "owner@test");
    expect(await bal(ACC.cash)).toBe(expected);
    const rows = await db.query<{ status: string; approved_by: string | null; difference: number }>("select status, approved_by, difference from daily_closings order by closed_at");
    expect(rows.map((r) => r.status)).toEqual(["superseded", "final"]);
    expect(rows[1]).toMatchObject({ approved_by: "owner@test", difference: 0 });
    expect(fixed).not.toBe(id);
  });
});

describe("reports, exports and permissions", () => {
  it("net profit = net sales - COGS + other income - expenses, and the pieces agree with the ledger", async () => {
    const pl = await profitAndLoss(db, "2000-01-01", "2100-01-01");
    const sum = pl.grossSales - pl.discounts - pl.refunds;
    expect(pl.netSales).toBe(sum);
    expect(pl.grossProfit).toBe(pl.netSales - pl.cogs);
    expect(pl.netProfit).toBe(pl.grossProfit + pl.otherIncome - pl.operatingCosts);
    expect(pl.discounts).toBe(200);
    const b = await balances(db);
    const inc = (c: string) => -(b.find((x) => x.code === c)?.balance ?? 0);
    expect(pl.grossSales).toBe(inc("4000") + inc("4010") + inc("4020"));
    expect(pl.cogs).toBe(b.find((x) => x.code === "5000")!.balance);
    expect(pl.grossMargin).not.toBeNull();
    const month = await profitSeries(db, "2000-01-01", "2100-01-01", "month");
    expect(month.reduce((s, r) => s + r.netProfit, 0)).toBe(pl.netProfit);
    expect((await profitSeries(db, "2000-01-01", "2100-01-01", "day")).length).toBeGreaterThan(0);
    expect((await profitSeries(db, "2000-01-01", "2100-01-01", "week")).length).toBeGreaterThan(0);
  });

  it("overview, valuation and the sales vs cash reports are separate and consistent", async () => {
    const o = await overview(db);
    expect(o.moneyTotal).toBe(o.money.reduce((s, m) => s + m.balance, 0));
    expect(o.inventory.valued).toBeGreaterThan(0);
    const inv = await inventoryValuation(db);
    expect(inv.reduce((s, r) => s + Number(r.value), 0)).toBe(o.inventory.valued);
    const sales = await salesReport(db, "2000-01-01", "2100-01-01");
    expect(sales.some((r) => r.source === "counter sale")).toBe(true);
    const cash = await cashCollection(db, "2000-01-01", "2100-01-01");
    expect(cash.length).toBeGreaterThan(0);
    expect((await productProfitability(db, "2000-01-01", "2100-01-01")).length).toBeGreaterThan(0);
  });

  it("exports escape quotes, neutralise spreadsheet formulas and keep numbers numeric", () => {
    const rows = [{ a: '=SUM(A1)', b: 'say "hi", ok', c: 12 }];
    const cols = [{ key: "a", label: "A" }, { key: "b", label: "B" }, { key: "c", label: "C" }];
    const csv = toCsv(rows, cols);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=SUM(A1)");
    expect(csv).toContain('"say ""hi"", ok"');
    const xml = toExcelXml("Report & more", rows, cols);
    expect(xml).toContain("<Data ss:Type=\"Number\">12</Data>");
    expect(xml).toContain("Report &amp; more");
    expect(xml).not.toContain('"=SUM');
  });

  it("owner has every permission; manager only what is assigned; staff get the counter and nothing that shows cost or profit", () => {
    const owner = { role: "owner", perms: permsFor("owner", []) };
    const mgr = { role: "manager", perms: permsFor("manager", ["finance_view"]) };
    const staff = { role: "staff", perms: permsFor("staff", []) };
    expect(can(owner, "finance_costs") && can(owner, "finance_close")).toBe(true);
    expect(can(mgr, "finance_view")).toBe(true);
    expect(can(mgr, "finance_costs")).toBe(false);
    expect(can(mgr, "finance_write")).toBe(false);
    expect(can(staff, "pos")).toBe(true);
    expect(can(staff, "finance_view") || can(staff, "finance_costs") || can(staff, "finance_write")).toBe(false);
    expect(permsFor("manager", ["not_a_permission"])).toEqual([]);
  });

  it("whole ledger still balances after everything above", async () => {
    expect(await ledgerIsBalanced(db)).toBe(true);
    expect((await balances(db)).reduce((s, a) => s + a.balance, 0)).toBe(0);
  });
});
