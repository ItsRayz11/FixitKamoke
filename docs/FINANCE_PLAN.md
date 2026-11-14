# Fixit finance, costing and accounting: implementation plan

Extends the existing Fixit app (Next.js 16, Postgres/Neon, PGlite in tests). Nothing is replaced. Every schema change is additive; existing data is untouched.

## 1. What exists and is reused

| Existing | Reused for |
|---|---|
| `products.stock`, `create-order.ts` (atomic decrement at placement), `transitionOrder` (restock on cancel/reject/return) | Stock stays the single on-hand number. The stock ledger records every change next to it. |
| `orders`, `order_items` (price snapshot), `advance_paid`, `balance_collected`, `refunded_amount`, `payment_status`, `payment_method` | Order money events post to the ledger from the existing functions (`verifyAdvance`, `recordBalanceCollected`, `recordRefund`, `setPaymentStatus`, `settlePayment`). |
| `repair_inquiries.approved_amount`, `repair_status_history` | Repair charge; completion recognises repair revenue. |
| `audit()` / `audit_events` | All sensitive finance actions. |
| `requireAdmin / assertAdmin`, roles owner > manager > staff, `admin_users` | Permission base; finance permissions are added on top. |
| `AdminShell` grouped, collapsible sidebar, `ui.tsx` helpers, navy/blue theme | New "Finance" group, same look. |
| `db.tx`, PGlite tests, `migrate()`, RLS-on-every-table test | Same patterns; new tables enable RLS. |
| `Inventory` page | Gets cost/value columns; stays the place to adjust stock (now writes a ledger row). |

## 2. Policies (documented decisions)

- **Inventory valuation:** moving weighted-average cost per product, in rupees with 2 decimals (`products.avg_cost`). Landed costs (transport, other, minus supplier discount) are spread over the lines in proportion to line value, so each unit carries its share.
- **Stock is increased only when a purchase is *received*.** A draft purchase changes nothing.
- **Order stock stages (unchanged behaviour, now ledgered):** stock is reserved (deducted) when the order is placed; released when the order is cancelled / rejected / returned. Every movement has an idempotency key, so a repeated status update can never deduct or restock twice.
- **Revenue recognition:** a product order is recognised when it reaches **delivered**. Money received earlier is a *customer advance* (liability), not revenue. COGS is recognised at the same moment from the cost snapshot on each order line.
- **Cost snapshot:** `order_items.unit_cost` is copied from `products.avg_cost` when the order is placed. Later cost changes never rewrite it. Lines whose cost was unknown are flagged `cost_known = false` and listed on the reports.
- **Opening inventory:** existing stock is recorded as `opening` movements with unknown cost. The owner may enter an opening cost per product (an audited, explicit declaration). Nothing is invented.
- **Returns / refunds:** a return after delivery restores stock at the snapshot cost and posts a refund (contra-revenue) so profit is not overstated. A cancel before delivery returns the advance to the customer, not through revenue.
- **Wallet services:** the principal moves between accounts (cash ↔ wallet) and is never revenue. Only the fee/commission is income (fixed amount or percentage).
- **Repairs:** parts used are taken from stock (ledgered, cost snapshot). Revenue = final charge, recognised at *completed*. Labour and direct costs are tracked per repair for the repair-profit report; direct costs paid in cash are posted as linked expenses; labour cost is report-only to avoid double counting salaries.
- **Time zone:** reports use Pakistan time (Asia/Karachi).

## 3. Schema (migration `018_finance.sql`, additive)

Money: whole rupees as integers, except unit costs (`numeric(14,2)`).

- `products`: + `avg_cost numeric(14,4)` (null = unknown), + `unvalued_units` (units on hand with unknown cost, set to current stock at go-live; used up first and reported, never guessed).
- `order_items`: + `unit_cost`, + `cost_unknown_qty` (null = placed before costing existed), + `returned_qty`.
- `orders`: + `delivered_at timestamptz` (backfilled from status history).
- `suppliers`; `purchases`, `purchase_items` (unit or box, units per box, invoice no., discount, transport, other cost, landed allocation, received_at, payment tracking, due date).
- `stock_movements`: immutable ledger (`opening, purchase, sale, sale_cancel, return, repair_use, pos_sale, adjustment, purchase_return`), `qty_delta`, `unit_cost`, ref, **unique idempotency key**.
- `fin_accounts` (chart of accounts + money accounts), `fin_journals`, `fin_entries`: double entry, **immutable** (triggers block UPDATE/DELETE), **balanced** (checked in the posting function and by a deferred constraint trigger), unique idempotency key, `reverses_journal_id` for reversals.
- Expense categories are the 6xxx accounts in `fin_accounts` (no separate table); `expenses` (+ optional receipt URL, optional order/repair link), `expense_templates` (recurring, month-keyed so a month posts once).
- `service_entries` (wallet / recharge / misc income, fixed or percent fee).
- `pos_sales`, `pos_sale_items` (walk-in sales with cost snapshot).
- `credit_parties`, `credit_items`, `credit_payments` (udhaar both directions, due dates, aging, limits).
- `repair_parts`, `repair_payments`; `repair_inquiries`: + `final_charge`, `labor_cost`, `completed_at`.
- `daily_closings` (final, auditable; corrections are new rows approved by the owner).
- `admin_users.finance_perms text[]`.

All new tables: RLS enabled (required by `security.test.ts`).

## 4. Posting rules (all idempotent by key, all reversible by a reversing journal)

| Event | Debit | Credit |
|---|---|---|
| Opening balance of an account | account | Owner equity |
| Purchase received | Inventory (net of discount, incl. landed cost) | Accounts payable |
| Supplier payment | Accounts payable | money account |
| Customer money received before delivery | money account | Customer advances |
| Order delivered | Customer advances (paid part) + Receivable (unpaid part) + Sales discounts | Sales + Shipping income |
| …same moment | COGS | Inventory |
| Balance collected after delivery | money account | Receivable |
| Refund (delivered) | Refunds & returns | money account |
| Return of goods (delivered) | Inventory | COGS |
| Walk-in sale | money account (or Receivable) + COGS | Sales + Inventory |
| Wallet deposit / withdrawal / recharge | accounts moved by principal; fee to Service income | |
| Expense | expense account | money account |
| Repair completed | money / Receivable (+ COGS for parts) | Repair income (+ Inventory) |
| Transfer between accounts | to-account | from-account |
| Credit sale | Receivable | Sales (no cash change) |

## 5. Permissions

`finance_perms` values: `finance_view` (overview, balances), `finance_costs` (cost and profit), `finance_write` (purchases, expenses, suppliers, accounts), `finance_close` (daily closing), `pos` (counter sales). Owner has all. Manager only what the owner assigns. Staff get `pos` only unless the owner assigns more, and never see cost, profit or balances. Every server action calls `assertFinance()`; hiding a menu item is not relied on. The app connects with one database role, so the database cannot tell users apart: enforcement is in the server layer, covered by tests.

## 6. UI

New sidebar group **Finance** (collapsible, icons): Overview, Purchases, Suppliers, Shop counter, Expenses, Accounts, Credit / Udhaar, Reports, Daily closing. The existing Inventory page gains cost and value; Payments and Orders keep working and post to the ledger.

## 7. Phases

1. **Foundation:** migration, ledger engine, stock ledger, costing, suppliers, purchases (receive, pay), opening inventory flags, order hooks (stock ledger, cost snapshot, delivery recognition, receipts, refunds, returns), tests.
2. **Money:** accounts, opening balances, transfers, expenses (+ recurring), wallet and misc services, shop counter, credit / udhaar, repairs finance.
3. **Insight:** daily closing, reports and CSV exports, financial dashboard, permissions UI, sidebar.
4. **Hardening:** end-to-end tests listed below, full suite, compatibility check against the deployed code.

## 8. Migration and release safety

- All changes are additive; old code keeps working against the new schema (new columns have defaults, hooks are new code paths).
- Local verification on PGlite (every migration runs from empty in tests).
- Before production: take a verified backup, apply to a **Neon branch** copy first, run the suite and a reconciliation query there, then ask the owner. **Nothing in this work touches the live database without explicit approval.**
- Order of release: migrate production first (additive), then deploy the code.

## 9. Acceptance tests

Purchase received → stock up and average cost; box purchase conversion; sale snapshots cost; later cost change does not move past profit; partial COD advance then final collection; walk-in sale; repair with parts; customer udhaar with partial repayment; supplier credit purchase and settlement; wallet deposit with percentage commission; expense and recurring-expense idempotence; transfer between accounts; refund and returned stock; duplicate payment event; daily closing difference; staff cannot read profit or balances; month-end profit; ledger always balanced; posted entries cannot be edited.

## 10. As built

See `docs/FINANCE_RELEASE.md` for the release steps and known limits. Code: `src/lib/finance/*` (ledger, stock, purchases, credit, orders, pos, services, expenses, repairs, closing, reports, export, permissions), pages under `src/app/admin/(panel)/finance/`, migration `db/migrations/018_finance.sql`, tests `tests/integration/finance-*.test.ts` and `e2e-prod/zy-finance.spec.ts`.
