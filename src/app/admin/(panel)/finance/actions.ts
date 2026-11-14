"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { audit } from "@/lib/audit";
import { flash } from "@/lib/admin/flash";
import { getDb } from "@/lib/db";
import { createMoneyAccount, ownerMovement, reconcile, setOpeningBalance, transfer } from "@/lib/finance/accounts";
import { closeDay, correctClosing } from "@/lib/finance/closing";
import { CreditLimitError, payCredit, setCreditLimit } from "@/lib/finance/credit";
import { addExpense, runRecurring, saveTemplate, voidExpense } from "@/lib/finance/expenses";
import { FinanceError } from "@/lib/finance/ledger";
import { returnOrderGoods } from "@/lib/finance/orders";
import { assertFinance, type FinancePerm } from "@/lib/finance/perms";
import { FINANCE_PERMS } from "@/lib/finance/perms-core";
import { ringUpSale, voidPosSale } from "@/lib/finance/pos";
import { cancelDraftPurchase, createPurchase, payPurchase, receivePurchase, saveSupplier } from "@/lib/finance/purchases";
import { addRepairPart, recordRepairPayment, removeRepairPart, setRepairFinance } from "@/lib/finance/repairs";
import { addService, voidService } from "@/lib/finance/services";
import { declareOpeningCost } from "@/lib/finance/stock";
import { todayPk } from "@/lib/finance/reports";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => { const v = s(f, k).replace(/,/g, ""); return v === "" ? NaN : Number(v); };
const int = (f: FormData, k: string, d = 0) => { const v = n(f, k); return Number.isFinite(v) ? Math.round(v) : d; };
const opt = (f: FormData, k: string) => s(f, k) || undefined;
const key = (f: FormData) => s(f, "key") || crypto.randomUUID();

/** Run an action: map expected problems to a message on the page, let real bugs surface. */
async function run(back: string, perm: FinancePerm, fn: (who: string, f: FormData) => Promise<string | void>, f: FormData): Promise<never> {
  const u = await assertFinance(perm);
  try {
    const ok = await fn(u.email, f);
    revalidatePath("/admin/finance", "layout");
    flash(back, { ok: ok || "Saved." });
  } catch (e) {
    if (e instanceof ZodError) flash(back, { error: e.issues[0]?.message ?? "Please check the form." });
    if (e instanceof FinanceError || e instanceof CreditLimitError) flash(back, { error: e.message });
    throw e;
  }
}

// ---------- suppliers & purchases ----------
export async function saveSupplierAction(f: FormData) {
  await run("/admin/finance/suppliers", "finance_write", async (who) => {
    await saveSupplier(await getDb(), { name: s(f, "name"), phone: opt(f, "phone"), email: opt(f, "email"), address: opt(f, "address"), notes: opt(f, "notes") }, who, opt(f, "id"));
    return "Supplier saved.";
  }, f);
}

export async function createPurchaseAction(f: FormData) {
  await run("/admin/finance/purchases", "finance_write", async (who) => {
    const items = [0, 1, 2, 3, 4, 5].map((i) => ({ productId: s(f, `p${i}`), packType: s(f, `t${i}`) === "box" ? "box" : "unit", qty: int(f, `q${i}`), unitsPerBox: int(f, `u${i}`, 1) || 1, cost: n(f, `c${i}`) }))
      .filter((r) => r.productId && r.qty > 0).map((r) => ({ ...r, packType: r.packType as "unit" | "box", cost: Number.isFinite(r.cost) ? r.cost : 0 }));
    const db = await getDb();
    const id = await createPurchase(db, {
      supplierId: opt(f, "supplier") ?? null, invoiceNo: opt(f, "invoice") ?? null, purchaseDate: s(f, "date") || (await todayPk(db)),
      discount: int(f, "discount"), transportCost: int(f, "transport"), otherCost: int(f, "other"), dueDate: opt(f, "due") ?? null, note: opt(f, "note") ?? null, items,
    }, who);
    if (s(f, "receiveNow") === "on") {
      const pay = int(f, "payNow");
      await receivePurchase(db, id, who, pay > 0 ? { amount: pay, account: s(f, "payAccount") || "1000" } : undefined);
      return "Purchase received. Stock and cost are updated.";
    }
    return "Draft purchase saved. Stock changes when you receive it.";
  }, f);
}

export async function receivePurchaseAction(f: FormData) {
  await run("/admin/finance/purchases", "finance_write", async (who) => { await receivePurchase(await getDb(), s(f, "id"), who); return "Received. Stock and average cost are updated."; }, f);
}
export async function cancelPurchaseAction(f: FormData) {
  await run("/admin/finance/purchases", "finance_write", async (who) => { await cancelDraftPurchase(await getDb(), s(f, "id"), who); return "Draft cancelled."; }, f);
}
export async function payPurchaseAction(f: FormData) {
  await run("/admin/finance/purchases", "finance_write", async (who) => { await payPurchase(await getDb(), s(f, "id"), int(f, "amount"), s(f, "account") || "1000", who, `pp:${key(f)}`); return "Payment recorded."; }, f);
}

// ---------- counter ----------
export async function counterSaleAction(f: FormData) {
  await run("/admin/finance/counter", "pos", async (who) => {
    const u = await assertFinance("pos");
    const canPrice = u.role === "owner" || u.perms.includes("finance_write");
    const items = [0, 1, 2, 3, 4, 5].map((i) => ({ productId: s(f, `p${i}`), quantity: int(f, `q${i}`), unitPrice: canPrice && Number.isFinite(n(f, `pr${i}`)) ? int(f, `pr${i}`) : undefined }))
      .filter((r) => r.productId && r.quantity > 0);
    const paid = Number.isFinite(n(f, "paid")) ? int(f, "paid") : undefined;
    const r = await ringUpSale(await getDb(), {
      items, discount: canPrice ? int(f, "discount") : 0, customerName: opt(f, "name"), customerPhone: opt(f, "phone"), payAccount: s(f, "account") || "1000", paid,
      dueDate: opt(f, "due"), allowOverLimit: u.role === "owner" && s(f, "over") === "on",
    }, who, `pos-${key(f)}`);
    return `Sale ${r.receiptNo}: Rs. ${r.total.toLocaleString("en-PK")}${r.credit ? `, Rs. ${r.credit.toLocaleString("en-PK")} on credit` : ""}.`;
  }, f);
}
export async function voidSaleAction(f: FormData) {
  await run("/admin/finance/counter", "finance_write", async (who) => { await voidPosSale(await getDb(), s(f, "id"), who, s(f, "why") || "voided"); return "Sale voided. Stock and money reversed."; }, f);
}
export async function serviceAction(f: FormData) {
  await run("/admin/finance/counter", "pos", async (who) => {
    await addService(await getDb(), {
      kind: s(f, "kind"), principal: int(f, "principal"), feeMode: s(f, "feeMode") === "percent" ? "percent" : "fixed", feeValue: Number.isFinite(n(f, "fee")) ? n(f, "fee") : 0,
      cashAccount: opt(f, "cash"), walletAccount: opt(f, "wallet"), customerName: opt(f, "name"), customerPhone: opt(f, "phone"), note: opt(f, "note"),
    }, who, `svc-${key(f)}`);
    return "Entry saved.";
  }, f);
}
export async function voidServiceAction(f: FormData) {
  await run("/admin/finance/counter", "finance_write", async (who) => { await voidService(await getDb(), s(f, "id"), who, s(f, "why") || "voided"); return "Entry voided."; }, f);
}

// ---------- expenses ----------
export async function addExpenseAction(f: FormData) {
  await run("/admin/finance/expenses", "finance_write", async (who) => {
    const db = await getDb();
    // Optional link to an order or repair (courier charge, gateway fee, outside part), so its profit can be seen.
    const orderNo = opt(f, "order")?.toUpperCase(); const repairRef = opt(f, "repair")?.toUpperCase();
    const orderId = orderNo ? (await db.query<{ id: string }>("select id from orders where order_number = $1", [orderNo]))[0]?.id : undefined;
    const repairId = repairRef ? (await db.query<{ id: string }>("select id from repair_inquiries where upper(reference) = $1", [repairRef]))[0]?.id : undefined;
    if (orderNo && !orderId) throw new FinanceError(`No order ${orderNo}.`);
    if (repairRef && !repairId) throw new FinanceError(`No repair ${repairRef}.`);
    await addExpense(db, { date: s(f, "date") || (await todayPk(db)), category: s(f, "category"), payAccount: s(f, "account") || "1000", amount: int(f, "amount"), description: s(f, "description"), receiptUrl: opt(f, "receipt") ?? null, orderId: orderId ?? null, repairId: repairId ?? null }, who, `ex-${key(f)}`);
    return "Expense recorded.";
  }, f);
}
export async function voidExpenseAction(f: FormData) {
  await run("/admin/finance/expenses", "finance_write", async (who) => { await voidExpense(await getDb(), s(f, "id"), who, s(f, "why") || "voided"); return "Expense cancelled with a reversing entry."; }, f);
}
export async function saveTemplateAction(f: FormData) {
  await run("/admin/finance/expenses", "finance_write", async (who) => { await saveTemplate(await getDb(), { name: s(f, "name"), category: s(f, "category"), payAccount: s(f, "account") || "1000", amount: int(f, "amount"), dayOfMonth: int(f, "day", 1), description: s(f, "description") }, who); return "Recurring expense saved."; }, f);
}
export async function runRecurringAction(f: FormData) {
  await run("/admin/finance/expenses", "finance_write", async (who) => {
    const db = await getDb(); const today = await todayPk(db);
    const made = await runRecurring(db, today.slice(0, 7), today, who);
    return made ? `${made} recurring expense(s) posted.` : "Nothing due: every recurring expense for this month is already posted.";
  }, f);
}

// ---------- accounts ----------
export async function createAccountAction(f: FormData) {
  await run("/admin/finance/accounts", "finance_write", async (who) => { await createMoneyAccount(await getDb(), { name: s(f, "name"), kind: s(f, "kind") as "cash" | "bank" | "wallet", openingBalance: int(f, "opening") || undefined }, who); return "Account added."; }, f);
}
export async function openingBalanceAction(f: FormData) {
  await run("/admin/finance/accounts", "finance_costs", async (who) => { await setOpeningBalance(await getDb(), s(f, "account"), int(f, "amount"), opt(f, "date"), who); return "Opening balance recorded."; }, f);
}
export async function transferAction(f: FormData) {
  await run("/admin/finance/accounts", "finance_write", async (who) => { await transfer(await getDb(), { from: s(f, "from"), to: s(f, "to"), amount: int(f, "amount"), note: opt(f, "note"), key: key(f) }, who); return "Transfer recorded."; }, f);
}
export async function ownerMovementAction(f: FormData) {
  const u = await assertFinance("finance_write");
  if (u.role !== "owner") throw new Error("Not authorized");
  await run("/admin/finance/accounts", "finance_write", async (who) => { await ownerMovement(await getDb(), { account: s(f, "account"), direction: s(f, "direction") === "out" ? "out" : "in", amount: int(f, "amount"), note: opt(f, "note"), key: key(f) }, who); return "Recorded."; }, f);
}
export async function reconcileAction(f: FormData) {
  const u = await assertFinance("finance_write");
  if (u.role !== "owner") throw new Error("Not authorized");
  await run("/admin/finance/accounts", "finance_write", async (who) => {
    const d = await reconcile(await getDb(), { account: s(f, "account"), actualBalance: int(f, "actual"), reason: s(f, "reason"), key: key(f) }, who);
    return d === 0 ? "The books already match." : `Difference of Rs. ${Math.abs(d).toLocaleString("en-PK")} ${d > 0 ? "added" : "removed"} and recorded.`;
  }, f);
}

// ---------- credit ----------
export async function creditPayAction(f: FormData) {
  const db = await getDb();
  const dir = (await db.query<{ direction: string }>("select direction from credit_items where id = $1", [s(f, "id")]))[0]?.direction;
  await run("/admin/finance/credit", dir === "payable" ? "finance_write" : "pos", async (who) => { await payCredit(db, s(f, "id"), int(f, "amount"), s(f, "account") || "1000", who, `cp-${key(f)}`); return "Payment recorded."; }, f);
}
export async function creditLimitAction(f: FormData) {
  await run("/admin/finance/credit", "finance_write", async (who) => { const v = s(f, "limit"); await setCreditLimit(await getDb(), s(f, "id"), v === "" ? null : int(f, "limit"), who); return "Credit limit saved."; }, f);
}

// ---------- closing ----------
export async function closeDayAction(f: FormData) {
  await run("/admin/finance/closing", "finance_close", async (who) => { await closeDay(await getDb(), { date: s(f, "date"), counted: int(f, "counted", -1), note: opt(f, "note") }, who); return "Day closed."; }, f);
}
export async function correctClosingAction(f: FormData) {
  const u = await assertFinance("finance_close");
  if (u.role !== "owner") throw new Error("Not authorized");
  await run("/admin/finance/closing", "finance_close", async (who) => { await correctClosing(await getDb(), s(f, "id"), int(f, "counted", -1), s(f, "reason"), who); return "Closing corrected. The earlier count is kept in the history."; }, f);
}

// ---------- costs, orders, repairs, permissions ----------
export async function openingCostAction(f: FormData) {
  const u = await assertFinance("finance_costs");
  if (u.role !== "owner") throw new Error("Not authorized");
  await run("/admin/inventory", "finance_costs", async (who) => {
    const db = await getDb();
    const cost = n(f, "cost");
    const used = await declareOpeningCost(db, s(f, "id"), cost, who);
    await audit(who, "opening_cost_declared", "product", s(f, "id"), { unitCost: cost, units: used });
    return `Cost of Rs. ${cost} set for ${used} existing unit(s).`;
  }, f);
}
export async function returnGoodsAction(f: FormData) {
  const orderId = s(f, "orderId");
  await run(`/admin/orders/${orderId}`, "finance_write", async (who) => {
    const rows = [...f.keys()].filter((k) => k.startsWith("good_")).map((k) => ({ itemId: k.slice(5), goodQty: int(f, k) })).filter((r) => r.goodQty > 0);
    if (!rows.length) throw new FinanceError("Enter how many of each item came back in good condition.");
    await returnOrderGoods(await getDb(), orderId, rows, who);
    return "Returned goods are back in stock at their original cost.";
  }, f);
}
export async function repairPartAction(f: FormData) {
  const id = s(f, "repairId");
  await run(`/admin/repairs/${id}`, "pos", async (who) => {
    await addRepairPart(await getDb(), id, { productId: opt(f, "product") ?? null, description: opt(f, "description"), quantity: int(f, "quantity", 1), unitCost: Number.isFinite(n(f, "cost")) ? n(f, "cost") : undefined, payAccount: opt(f, "account") }, who, key(f));
    return "Part added to this repair.";
  }, f);
}
export async function removeRepairPartAction(f: FormData) {
  const id = s(f, "repairId");
  await run(`/admin/repairs/${id}`, "finance_write", async (who) => { await removeRepairPart(await getDb(), s(f, "id"), who); return "Part removed and returned to stock."; }, f);
}
export async function repairPaymentAction(f: FormData) {
  const id = s(f, "repairId");
  await run(`/admin/repairs/${id}`, "pos", async (who) => { await recordRepairPayment(await getDb(), id, int(f, "amount"), s(f, "account") || "1000", who, `rpay-${key(f)}`); return "Payment recorded."; }, f);
}
export async function repairFinanceAction(f: FormData) {
  const id = s(f, "repairId");
  await run(`/admin/repairs/${id}`, "finance_write", async (who) => {
    await setRepairFinance(await getDb(), id, { finalCharge: Number.isFinite(n(f, "charge")) ? int(f, "charge") : undefined, laborCost: Number.isFinite(n(f, "labor")) ? int(f, "labor") : undefined }, who);
    return "Saved.";
  }, f);
}
export async function setFinancePermsAction(f: FormData) {
  const u = await assertFinance("finance_view");
  if (u.role !== "owner") throw new Error("Not authorized");
  const id = s(f, "id");
  const granted = FINANCE_PERMS.filter((p) => f.get(`perm_${p}`) === "on");
  await run("/admin/users", "finance_view", async (who) => {
    const db = await getDb();
    const t = (await db.query<{ role: string }>("select role from admin_users where id = $1", [id]))[0];
    if (!t || t.role === "owner") throw new FinanceError("The owner always has every finance permission.");
    await db.query("update admin_users set finance_perms = $2 where id = $1", [id, granted]);
    await audit(who, "finance_permissions_set", "admin_user", id, { granted }, db);
    return "Finance permissions saved.";
  }, f);
}
