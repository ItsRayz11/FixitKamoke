# Finance release runbook

Branch: `finance` (not merged). **Nothing here has touched the live database.** Pushing to `master` deploys production, and the new code reads the new columns, so the order below matters.

## What was verified without production

- Migration `018_finance.sql` runs from empty (all tests) and on a throwaway copy of the real shop data (24 products, 496 units, 1 order from `db-backup-202611131844`): every existing row unchanged, opening stock recorded as 496 unknown-cost units, no cost invented, ledger empty and balanced.
- Through the real `postgres` driver and `npm run db:migrate` in the production-mode smoke run (`e2e-prod`).
- 306 unit/integration tests, 9 production-mode browser tests (guest checkout, owner setup, purchase, counter, wallet service, expense, closing, reports, exports, staff and signed-out restrictions).

## Steps that need the owner's approval

1. **Back up** the live database (JSON export as before, plus a Neon branch/snapshot).
2. **Rehearse on a Neon branch** of the live database: apply `018_finance.sql`, run the reconciliation queries below, open the finance pages against it.
3. **Migrate production first** (`node scripts/migrate.mjs` with `DATABASE_URL_UNPOOLED`). The migration is additive; the currently deployed code keeps working against it (new columns are nullable or defaulted).
4. **Then merge `finance` into `master`** to deploy the code.
5. In **Admin → Finance → Accounts**, enter the opening balance of each account (cash, bank, JazzCash, Easypaisa). In **Inventory**, enter the cost of existing stock (owner only) where known.
6. Optional: set `CRON_SECRET` and schedule `GET /api/cron/finance` daily to post recurring expenses automatically (each posts once per month).

## Reconciliation queries (run after migrating a branch or production)

```sql
-- every journal balances (must return 0 rows)
select journal_id from fin_entries group by journal_id having sum(debit) <> sum(credit);
-- opening stock equals the shelf (both numbers equal)
select (select sum(stock) from products) as shelf, (select sum(qty_delta) from stock_movements where kind = 'opening') as opening;
-- no cost was invented (must be 0)
select count(*) from products where avg_cost is not null;
-- existing order lines are flagged unknown, not guessed (must be 0)
select count(*) from order_items where unit_cost is not null or cost_unknown_qty is not null;
```

## Rollback

The migration only adds. To go back, redeploy the previous code; the new tables and columns are ignored by it. Do not drop them if any finance entries were posted: the ledger is immutable by design.

## Known limits (be aware)

- **Permissions are enforced on the server** (every action, page and download checks the finance permission). The database cannot tell staff apart because the app connects with one database role, so database-level enforcement is not possible without a per-user database role design.
- **Excel export** is a native `.xlsx` file (CSV is also offered).
- **COD and online receipts** default to these accounts: COD advance to Bank, COD cash to Cash, bank transfer and online to Bank, JazzCash and Easypaisa to their wallets. Override with a `finance` row in `store_settings`; a wrong guess is corrected with a transfer, never by editing history.
- **Stock stages** are unchanged: stock is reserved (deducted) when an order is placed and released on cancel/reject. Returned goods after delivery go back through **Returned goods** on the order page. Every movement is ledgered once, by key.
- **Labour cost on repairs** is report-only (not posted) so it is not double counted with salaries.
- Purchases and counter sales take up to 20 item lines per form (more can be added as a second document). Excel downloads are real .xlsx files; the older XML format is still available with `format=xls`.
