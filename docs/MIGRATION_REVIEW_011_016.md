# Migration review: 011 to 016

**Status: reviewed, tested locally, NOT applied to production.** Apply only after a backup (section 3) and the owner's go-ahead.

All six migrations are additive. None drops a table, a column or any data. They were applied in order, on top of migrations 001 to 010, to an embedded database in every automated test, and through the real Postgres driver in the production-mode suite (`npm run test:prod`).

## 1. What each one does

| File | Changes | Existing rows | Risk |
|---|---|---|---|
| `011_cod_advance.sql` | `orders` gets `advance_required`, `advance_bps`, `advance_paid`, `advance_verified_at`, `advance_verified_by`; payment status gains `partial`. | `advance_required` and `advance_paid` default to 0, so every existing order behaves exactly as before. | Low. Replaces one CHECK constraint (`orders_payment_status_check`) with a wider one. Takes a brief lock on `orders`. |
| `012_discounts.sql` | `products` gets `sale_starts_at`, `sale_ends_at`; `coupons` gets `starts_at`, `per_customer_limit`, `allow_with_sale`, `category_id`; coupon type gains `freeship`. | Sale windows empty = always on (old behaviour). Coupons keep working; `allow_with_sale` defaults to true. | Low. Replaces `coupons_type_check`. |
| `013_manual_wallets.sql` | `orders.payment_method` accepts `jazzcash_manual` and `easypaisa_manual`. | None. | Low. Replaces `orders_payment_method_check`. |
| `014_fulfilment.sql` | `orders` gets `carrier`, `tracking_number`, `dispatched_at`, `balance_collected*`, `refunded_amount`; statuses gain `packed` and `out_for_delivery`; payment status gains `partially_refunded`; new table `order_notes` (row level security on). | Defaults of 0 or null. | Low. Replaces two CHECK constraints. |
| `015_repair_approval.sql` | `repair_inquiries` gets `approved_at`, `approved_amount`, `approved_by`. | Null. An already-booked repair with no approval record is not blocked from moving on; only the step into "in repair" now needs an approval or a staff-recorded "booked in". | Low. See the note below. |
| `016_product_seo_status.sql` | `products` gets `seo_title`, `seo_description`, `archived`; a check that a product is never both archived and published. | `archived` defaults to false, so no existing product changes status. | Low. |

**Note on 015 (behaviour, not data):** after this release, staff cannot move a repair to "In repair" unless the customer approved the current price or staff recorded it by booking the repair in. Repairs already in progress are unaffected. Tell staff before release.

**Note on payment-before-confirm (code, not migration):** transfer, wallet and online orders can no longer be moved to "Confirmed" until the payment is marked paid. Cash-on-delivery orders are unaffected unless the advance rule is switched on.

## 2. What is NOT changed
- No existing order, product, customer, repair or coupon is edited, deleted or re-priced.
- The COD advance rule is off by default. Nothing asks any customer for an advance until the owner turns it on.

## 3. Before applying (required)
1. **Back up.** In Neon, create a branch from `production` named `pre-011-backup` (instant, copy-on-write). Do not delete it for at least two weeks.
2. **Rehearse.** Create a second branch from `production`, point a local copy at it with `DATABASE_URL` in your shell only, run `npm run db:migrate`, and click through Orders, Products, Payments, Repairs. Delete that branch afterwards.
3. **Apply.** Run `npm run db:migrate` against production (it applies only migrations not yet recorded, in order, each in its own transaction). Deploy the new code straight after, because the new code reads the new columns.
4. **Check.** Open an existing order, place a test order with cash on delivery, open Admin > Payments.

## 4. Rolling back
- **Code:** redeploy the previous Vercel deployment. The old code ignores the new columns, so it keeps working against the migrated database.
- **Data:** restore the `pre-011-backup` branch (Neon: reset the branch from it or switch the default branch). Orders placed after migration would be lost on a restore, so prefer the code rollback unless the data itself is damaged.
- There is no down-migration. The constraints that were widened do not need narrowing for the old code to run.

## 5. Order of operations for release
1. Back up (section 3.1). 2. Set `SITE_URL`, `ADMIN_SETUP_TOKEN`, `TWO_FACTOR_KEY` in Vercel (Production). 3. Run the migration. 4. Deploy. 5. Create the owner at `/admin/setup`, then delete `ADMIN_SETUP_TOKEN`. 6. Send a test email (Admin > Email) once Resend is set up. 7. Decide the advance rule.
