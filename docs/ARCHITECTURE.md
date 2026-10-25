# Architecture

## Shape
One Next.js 16 app (modular monolith). Public storefront and admin share one codebase and one Postgres database.

```
Browser ──► Next.js (server components, server actions, route handlers)
              │  src/proxy.ts  (maintenance mode, /admin cookie gate, noindex headers)
              ├─ src/app/(shop)/…      storefront, account, repairs, blog, policies
              ├─ src/app/admin/…       staff area (every page + action re-checks the session)
              ├─ src/app/api/…         events, email cron (secret), dev-only helpers (demo mode only)
              └─ src/lib/…             domain logic, db, auth, orders, repairs, email, payments
                         │
                    src/lib/db  ──►  postgres.js → DATABASE_URL (Supabase / Neon / any Postgres)
                                 └►  PGlite (embedded, dev + tests only)
```

## Boundaries
- **`src/lib/domain`** pure logic, no I/O: integer PKR money, Pakistani phone normalisation, shipping zone quotes, pricing/coupons, order and repair state machines. Unit-tested.
- **`src/lib/orders`, `repairs`, `customers`, `blog`, `reviews`, `marketing`, `email`, `payments`** business rules that talk to the database through `Queryable`; each has integration tests against a real (embedded) Postgres.
- **Server actions** (`"use server"`) are thin: parse input with Zod, check authorisation, call the library, redirect with a message.
- **Client components** only where interaction needs them: cart (localStorage external store), checkout form, repair/contact forms, header, toast.

## Data flow: placing an order
1. Cart lives in the browser as `[productId, quantity]` only.
2. Cart/checkout pages call `getCartView` / `getShippingView` for authoritative prices, stock and delivery fee.
3. `placeOrder` (rate-limited) → `createOrder` in one transaction: payment method enabled? → atomic stock decrement per line → coupon → shipping quote (COD allowed? serviceable?) → totals → insert order, immutable `order_items`, status history, funnel event, email outbox row.
4. Response returns the order number and a one-time tracking token (only its SHA-256 is stored). A retry with the same idempotency key returns the existing order and takes no stock.
5. `after()` triggers the email outbox processor; failures never affect the order.

## Authentication and authorisation
- Staff: `admin_users` (+`admin_sessions`), roles `staff < manager < owner`. `requireAdmin(min)` for pages, `assertAdmin(min)` for actions. The proxy only checks cookie presence as a first filter.
- Customers: optional accounts (`customers`, `customer_sessions`). Orders are attached to an account only from the session on the server. Guests track by secret link or order number + phone (rate-limited, same message for wrong number or wrong phone).
- First owner: `/admin/setup` works only while no admin exists and only with `ADMIN_SETUP_TOKEN`.

## Database
Migrations `db/migrations/001…` define: categories, products, product_images, coupons, orders, order_items, order_status_history, repair_inquiries, repair_status_history, blog_posts, admin_users/sessions, customers/sessions/addresses, wishlist_items, reviews, password_resets, marketing_consent, notification_outbox, analytics_events, contact_messages, audit_events, store_settings. Money columns are integer rupees with CHECK constraints. Foreign keys protect history (`order_items.product_id` is `ON DELETE SET NULL`; items keep their own name/price snapshot).

## Caching
Pages are dynamic (`force-dynamic`) and private pages send `no-store`. Nothing personal (cart, orders, account) is cached across users.

## Error handling and logging
Customer-facing errors are plain-language; server errors log a short message and show a generic page with a reference digest. Sensitive admin actions write `audit_events`. Email failures are recorded on the outbox row with provider text truncated and the API key never included.

## Testing strategy
Vitest unit + integration (real Postgres semantics via PGlite) and Playwright end-to-end (desktop and a phone profile) including axe accessibility scans. See QA_CHECKLIST.md.

## Deployment and rollback
See DEPLOYMENT_GUIDE.md. Rollback = redeploy the previous build; migrations are additive and forward-only (take a database backup before each migration).
