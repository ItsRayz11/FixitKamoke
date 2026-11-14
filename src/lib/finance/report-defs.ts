import type { Queryable } from "@/lib/db";
import { aging } from "./credit";
import { expensesByCategory } from "./expenses";
import type { Col } from "./export";
import type { FinancePerm } from "./perms-core";
import { repairProfit } from "./repairs";
import { accountMovements, cashCollection, closingsReport, inventoryValuation, productProfitability, profitAndLoss, salesReport, supplierPurchases } from "./reports";

export interface ReportData { title: string; note?: string; cols: Col[]; rows: Record<string, unknown>[] }
interface Def { label: string; perm: FinancePerm; build: (q: Queryable, from: string, to: string, account: string) => Promise<ReportData> }
const n = (v: unknown) => Number(v ?? 0);

export const REPORTS: Record<string, Def> = {
  pnl: { label: "Profit and loss", perm: "finance_costs", build: async (q, from, to) => {
    const p = await profitAndLoss(q, from, to);
    const rows: { line: string; amount: number | string }[] = [
      { line: "Gross sales", amount: p.grossSales }, { line: "Discounts", amount: -p.discounts }, { line: "Refunds and returns", amount: -p.refunds }, { line: "Net sales", amount: p.netSales },
      { line: "Cost of goods sold", amount: -p.cogs }, { line: "Gross profit", amount: p.grossProfit }, { line: "Gross margin", amount: p.grossMargin === null ? "n/a" : `${(p.grossMargin * 100).toFixed(1)}%` },
      { line: "Service fees and commissions", amount: p.otherIncome }, ...p.expenseLines.map((e) => ({ line: e.name, amount: -e.total })),
      { line: "Write-offs and cash differences", amount: -p.losses }, { line: "Total operating costs", amount: -p.operatingCosts }, { line: "Net profit", amount: p.netProfit },
      { line: "Net margin", amount: p.netMargin === null ? "n/a" : `${(p.netMargin * 100).toFixed(1)}%` },
    ];
    return { title: "Profit and loss", note: p.unknownCostUnits ? `${p.unknownCostUnits} unit(s) sold in this period had no known cost and are not in cost of goods sold.` : undefined, cols: [{ key: "line", label: "Line" }, { key: "amount", label: "Amount (Rs.)" }], rows };
  } },
  sales: { label: "Sales (by document)", perm: "finance_costs", build: async (q, from, to) => ({ title: "Sales", note: "Sales are counted when delivered or sold at the counter. Money actually received is in the Cash collection report.", cols: [
    { key: "date", label: "Date" }, { key: "source", label: "Source" }, { key: "ref", label: "Reference" }, { key: "gross", label: "Gross" }, { key: "discount", label: "Discount" }, { key: "net", label: "Net" }, { key: "cost", label: "Cost (known)" }, { key: "unknown_units", label: "Units with unknown cost" }],
    rows: (await salesReport(q, from, to)) as unknown as Record<string, unknown>[] }) },
  cash: { label: "Cash collection (actual money)", perm: "finance_view", build: async (q, from, to) => ({ title: "Cash collection", note: "Real money in and out by account and source, excluding nothing: credit sales and advances show up here only when money moves.", cols: [
    { key: "account", label: "Account" }, { key: "source", label: "Source" }, { key: "received", label: "Received" }, { key: "paidOut", label: "Paid out" }], rows: await cashCollection(q, from, to) }) },
  purchases: { label: "Supplier purchases", perm: "finance_costs", build: async (q, from, to) => ({ title: "Supplier purchases", cols: [{ key: "supplier", label: "Supplier" }, { key: "purchases", label: "Purchases" }, { key: "total", label: "Total" }, { key: "paid", label: "Paid" }, { key: "owed", label: "Still owed" }],
    rows: (await supplierPurchases(q, from, to)).map((r) => ({ ...r, owed: n(r.total) - n(r.paid) })) }) },
  inventory: { label: "Inventory valuation", perm: "finance_costs", build: async (q) => ({ title: "Inventory valuation", note: "Moving average cost. Units with no known cost are listed but not valued.", cols: [{ key: "name", label: "Product" }, { key: "sku", label: "SKU" }, { key: "stock", label: "In stock" }, { key: "avg_cost", label: "Average cost" }, { key: "valued_units", label: "Valued units" }, { key: "unknown_units", label: "Unknown-cost units" }, { key: "value", label: "Value" }], rows: (await inventoryValuation(q)) as unknown as Record<string, unknown>[] }) },
  expenses: { label: "Expenses by category", perm: "finance_costs", build: async (q, from, to) => ({ title: "Expenses by category", cols: [{ key: "name", label: "Category" }, { key: "total", label: "Total" }], rows: (await expensesByCategory(q, from, to)).filter((r) => n(r.total) !== 0) }) },
  accounts: { label: "Account movements", perm: "finance_view", build: async (q, from, to, account) => ({ title: `Account movements (${account})`, cols: [{ key: "date", label: "Date" }, { key: "memo", label: "What" }, { key: "ref_type", label: "Source" }, { key: "debit", label: "In" }, { key: "credit", label: "Out" }, { key: "actor", label: "By" }], rows: await accountMovements(q, account, from, to) }) },
  credit: { label: "Credit balances (aging)", perm: "finance_view", build: async (q) => {
    const rows = [...(await aging(q, "receivable")).map((r) => ({ ...r, side: "Customer owes you" })), ...(await aging(q, "payable")).map((r) => ({ ...r, side: "You owe supplier" }))];
    return { title: "Credit balances", cols: [{ key: "side", label: "Side" }, { key: "name", label: "Name" }, { key: "current", label: "Not due" }, { key: "d1_30", label: "1-30 days" }, { key: "d31_60", label: "31-60" }, { key: "d61_90", label: "61-90" }, { key: "d90plus", label: "90+" }, { key: "total", label: "Total" }], rows };
  } },
  repairs: { label: "Repair profit", perm: "finance_costs", build: async (q, from, to) => ({ title: "Repair profit", cols: [{ key: "reference", label: "Repair" }, { key: "device", label: "Device" }, { key: "charge", label: "Charge" }, { key: "partsCost", label: "Parts" }, { key: "directCosts", label: "Direct costs" }, { key: "labor", label: "Labour" }, { key: "profit", label: "Profit" }, { key: "unknownCostParts", label: "Parts of unknown cost" }], rows: await repairProfit(q, from, to) as unknown as Record<string, unknown>[] }) },
  products: { label: "Product profitability", perm: "finance_costs", build: async (q, from, to) => ({ title: "Product profitability", note: "Revenue is the line price before any order-level coupon. Units with unknown cost are excluded from cost, so their profit looks higher until their cost is known.", cols: [{ key: "product", label: "Product" }, { key: "units", label: "Units" }, { key: "revenue", label: "Revenue" }, { key: "cogs", label: "Cost (known)" }, { key: "profit", label: "Profit" }, { key: "unknown_units", label: "Unknown-cost units" }],
    rows: (await productProfitability(q, from, to)).map((r) => ({ ...r, revenue: Math.round(n(r.revenue)), profit: Math.round(n(r.revenue)) - n(r.cogs) })) }) },
  closing: { label: "Daily closings", perm: "finance_close", build: async (q, from, to) => ({ title: "Daily closings", cols: [{ key: "date", label: "Day" }, { key: "opening", label: "Opening" }, { key: "received", label: "Received" }, { key: "paid_out", label: "Paid out" }, { key: "transfers_net", label: "Transfers" }, { key: "expected", label: "Expected" }, { key: "counted", label: "Counted" }, { key: "difference", label: "Difference" }, { key: "status", label: "Status" }, { key: "closed_by", label: "Closed by" }, { key: "approved_by", label: "Approved by" }], rows: (await closingsReport(q, from, to)) as Record<string, unknown>[] }) },
};
