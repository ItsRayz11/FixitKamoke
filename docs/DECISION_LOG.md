# Decision log

Each entry: what was decided, why, and what was rejected. Dates are 2026. "Verified" means checked against the provider's own documentation or pricing page during this project; "third-party" means a review site said so and should be re-checked before paying.

## 1. Modular monolith on Next.js (App Router)
**Decision:** One Next.js 16 app (React 19, TypeScript, Tailwind 4) with server components, server actions and a few route handlers. **Why:** one deployable, one language, server-side order logic next to the pages that use it. **Rejected:** microservices and a separate API (no measured need; more cost and failure modes).

## 2. Plain PostgreSQL with versioned SQL migrations (host-agnostic)
**Decision:** Talk to Postgres directly through `postgres` (prod) or embedded PGlite (local/tests) behind one small interface (`src/lib/db`). Migrations are plain `.sql` files in `db/migrations`, applied by `npm run db:migrate`. **Why:** the same SQL, transactions (`FOR UPDATE`, `SKIP LOCKED`) and constraints run in tests and production; no lock-in to a vendor SDK; any Postgres host works. **Rejected:** Appwrite (document model, weaker fit for orders/stock transactions), an ORM (extra layer for ~25 tables), and a vendor client SDK in the browser (it would expose the database to visitors).

## 3. Own authentication instead of Supabase Auth
**Decision:** scrypt password hashing, random 32-byte session tokens stored hashed, httpOnly SameSite=Lax cookies, roles `owner / manager / staff`, audit log. Customer accounts use the same primitives. **Why:** works with any Postgres host, no extra service, fully testable offline. **Trade-off:** we own password reset and session handling (both implemented and tested). Email verification of customer sign-ups is not built (an unverified email gives no access to anyone's orders, because orders are linked to accounts only by the signed-in session).

## 4. Server is the only authority for money and stock
**Decision:** the browser sends product ids and quantities only. The server reads prices, applies coupons and shipping, decrements stock with a conditional `UPDATE ... WHERE stock >= qty` inside one transaction, stores an immutable item snapshot, and uses an idempotency key per checkout visit. **Why:** prevents price tampering, overselling and duplicate orders. Covered by integration and browser tests, including a tampered-cart test.

## 5. Hosting and database plans (researched, not assumed)
Findings from the providers' own pages unless noted:
- **Vercel Hobby is for non-commercial, personal use only.** A store that takes orders is commercial, so it must not run on Hobby. A paid plan (Pro) is required for the live site. ([fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines)) Hobby/preview is fine for non-commercial testing only.
- **Supabase Free:** 500 MB database, free projects pause after one week of inactivity, no daily backups (third-party summaries; confirm on [supabase.com/pricing](https://supabase.com/pricing)). A store cannot go dark after a quiet week or run without backups. **Supabase Pro** is about USD 25/month and includes daily backups kept 7 days (third-party; confirm).
- **Neon Free:** compute scales to zero after 5 minutes, monthly compute/storage/egress caps that suspend the database until the next month when reached; commercial use is not stated in what was found, so read Neon's terms before relying on it for a live shop.
- **Railway Hobby:** USD 5/month plan with usage-based extras; the docs describe Hobby as for personal projects and Pro for production. Read Railway's terms before running a paid business on Hobby.
- **Cloudflare Workers (OpenNext):** the free plan has a 10 ms CPU limit per request and 100,000 requests/day, and the OpenNext Cloudflare adapter describes itself as pre-1.0, so it is **not** recommended for this app now.
- **Resend Free:** 100 emails/day, 3,000/month, one verified domain; sending pauses at the limit ([Resend quota](https://resend.com/docs/knowledge-base/resend-email-quota)). Enough for a small shop to start; a busy day of order and status emails can exceed 100.

**Decision:** recommend a **paid** app host (Vercel Pro, or a small VPS/Railway Pro) and a **paid, backed-up** Postgres (Supabase Pro or Neon paid) for the live shop. Free tiers are acceptable for development and non-commercial previews only. The final choice and spend are the owner's (see LAUNCH_BLOCKERS).

## 6. Next.js 16 specifics
`middleware.ts` is now `proxy.ts`; `cookies()`/`params`/`searchParams` are async. **Cache Components is turned off** (the scaffold enabled it): it forces every database read behind Suspense/caching, which adds risk for a database-driven store. Pages are dynamic and can be cached explicitly later. Tailwind v4 is compiled through the scaffold's `@tailwindcss/turbopack` loader rule in `next.config.ts` (removing it silently unstyles the site).

## 7. Payments
**Decision:** cash on delivery and bank transfer are real and owner-configurable. Online gateways (JazzCash, Easypaisa, Safepay) are listed with their required credentials and are **never available** until an adapter, signed-callback verification and a passing sandbox test exist. **Rejected:** any simulated or "demo" payment path, since it could mislead customers.

## 8. Email
**Decision:** a database outbox (`notification_outbox`) with a stable idempotency key per message; a processor claims rows with `SKIP LOCKED`, retries up to 5 times, expires stale messages (7 days; password resets 1 hour) and wipes secrets after sending. Sent through the Resend HTTP API when `RESEND_API_KEY` and `EMAIL_FROM` exist; otherwise nothing is sent and the admin Email page says so. Email failure can never fail or duplicate an order.

## 9. Privacy-minimal analytics
First-party counters only: event name and path, no IP, cookie id or device data; honours Do Not Track and Global Privacy Control. **Rejected:** third-party analytics scripts (performance and privacy cost; no need yet).

## 10. Rate limiting
In-memory fixed window per process. Slows abuse on a single server; on serverless/multi-instance hosting each instance counts separately, so a shared store (for example a Postgres counter table or a managed Redis) is needed for hard guarantees. Recorded as a known limitation.

## 11. UI libraries
shadcn/ui primitives are added only where they fix a real gap (accessible drawer and confirmation dialogs). The rest uses plain components over design tokens (`src/app/globals.css`). Glassmorphism is limited to the cart toast; neumorphism is not used for controls.

## 12. Images and uploads
Product, blog and founder photos are referenced by https URL. Direct file upload is **not built**: it needs a storage bucket and validation pipeline (type sniffing, size limit, re-encoding) that should be set up with the real host. Recorded in LAUNCH_BLOCKERS.

## 13. Selected and rejected resources
Used: Next.js, React, Tailwind, Zod, postgres.js, PGlite, Vitest, Playwright, @axe-core/playwright, Resend (HTTP API). Evaluated and not used: Appwrite, Supabase JS client/Auth, Magic UI / Aceternity / React Bits (decorative animation components with added bundle weight; not needed), third-party analytics, an ORM.

## 14. Lessons from running the production build on a real Postgres connection
- **JSON double-encoding (fixed).** The `postgres` driver JSON-stringifies parameters for `json/jsonb` columns, but our code (and the embedded test database) passes already-serialised JSON strings. On the real driver this stored escaped *strings* instead of objects, which would have broken delivery zones, store settings and email payloads in production while every embedded-database test passed. Fix: `types.json.serialize` passes strings through (`src/lib/db/index.ts`). Guard: `tests/integration/postgres-driver.test.ts` runs the key flows through the production driver over a real socket.
- **Run-time address.** `NEXT_PUBLIC_*` variables are baked in when the site is built. The run-time `SITE_URL` takes priority for links, the sitemap and emails. `robots.txt` is generated per request, not once at build.
- **Pool size.** `DATABASE_POOL_MAX` (default 5) lets serverless hosts keep connections low.

## 15. Rate limiting and the visitor's address
Limits are keyed by the visitor's IP. `X-Forwarded-For` lists every hop and the left-hand entries can be typed by the visitor, so the **last** entry (added by the proxy in front of the app) or `X-Real-IP` is used (`src/lib/client-ip.ts`). This is only trustworthy behind a proxy such as Vercel, Cloudflare or nginx; do not expose the app directly to the internet. The counter is still per server process (see 10).

## 16. Content-Security-Policy
Production sends a CSP with `default-src 'self'`, no third-party script origins, `object-src 'none'`, `frame-ancestors 'self'`, `form-action 'self'`, and HSTS. `'unsafe-inline'` remains for scripts because Next.js bootstraps and the JSON-LD blocks are inline. Moving to per-request nonces would remove it but forces every page to render dynamically on each request with extra complexity; deferred.

## 17. Shop alerts
New orders, repair requests and contact messages queue an email to the contact address in Store settings (switchable). The text carries a reference and summary only, never a customer's phone or address.

## 18. Accessibility finding
A scroll-reveal that faded text in from low opacity made contrast checks fail while the text was still faded. The reveal now only slides (no opacity change).

## 19. V2 decisions (mobile-first, Liquid Glass + Titanium)
- **Finishes are separate product rows linked by a group** (migration 007), not a variants table. Stock, SKU, price, photos, carts and order snapshots already work per product, so the checkout/stock code did not change and overselling stays impossible per finish. Cost: the admin creates one product per finish (documented in the form and PRODUCT_PHOTOGRAPHY_GUIDE.md). Order lines record "Name — Finish".
- **Selecting a finish is a real product switch**: photos, price, stock and the address bar (`history.replaceState`) change together. A finish without photos shows an honest placeholder, never another colour's picture.
- **Required finish**: if the owner ticks it, nothing is preselected, "Add to cart" becomes "Choose a finish" and guides focus to the choice.
- **Component styles live in `@layer components`** so Tailwind utilities still override them (an unlayered `.purchase-bar{position:fixed}` otherwise beats `lg:static`).
- **Purchase bar** is shown only below 1024px, only while the in-page button is off screen, and hides while a text field is focused so it never covers a form. Safe-area insets and `viewport-fit=cover` are used; pinch-zoom is not disabled.
- **Funnel analytics** gain listing/click/cart/checkout-error/repair-start events and a coarse `device` (viewport ≤767px, not the user agent). Still count-only; Do Not Track / GPC honoured. The admin Funnel page shows ratios only after 30 events and states that no A/B test is running.
- **Popular categories** are ranked by real product-view counts (30 days) then in-stock counts; nothing is fabricated. Homepage reviews appear only when approved reviews exist.
- **Phone preview** is an admin-only review aid (an iframe in a device-shaped frame); production never renders inside a frame. CSP `frame-src` gained `'self'` for it.
- **Titanium Spotlight** tilt is on only for hover-capable fine pointers and never under reduced motion; touch devices get a static stage plus a one-off light sweep.
- **3D rotation, direct image upload and AI-generated product imagery were not built.** Real photographs per finish and angle only.

## 20. V2 follow-up decisions
- **Admin tables become cards on phones by labelling cells from the header at run time** (one small client component) instead of rewriting 14 tables. Before it runs, a table scrolls sideways as it always did, so nothing is lost without JavaScript.
- **Back-in-stock is transactional, not marketing**: one email per request, no consent tick needed, address deleted within 30 days (alert row and queued email). It is offered only for something sold out right now. A database sweep ("alerts whose product now has stock") sends it, so every way stock can return is covered, including a cancelled order restocking.
- **Reviews are shared across the finishes of one product** (and tagged with the finish) so a colour with no reviews of its own still shows the product's reviews.
- **Two-step sign-in is optional and key-gated, not enforced.** It needs a `TWO_FACTOR_KEY` so secrets are encrypted at rest; without it the page says what to configure and nothing changes. Not enforced because the owner could lock themselves out before enrolling; recommended for everyone. Recovery: single-use codes, and an owner can reset a colleague. SMS codes were rejected (SIM-swap risk, cost).

## 21. Online payments, uploads and the 360° view
- **Money is only ever marked paid by a verified message from the provider** (signature + our reference + exact amount). The customer's browser, the return address and the result page cannot change a payment's status. Unknown, altered, wrong-amount or repeated messages change nothing and are logged.
- **A gateway cannot go live untested.** Off -> testing (visible to signed-in staff only) -> live. "Live" stays locked until a signature-verified message matched to a real payment of ours has been received. This replaces "trust that the integration is right" with proof from the owner's own account, which matters because the adapters were written from public documentation, not run against live accounts.
- **Online payment needs a confirmed delivery fee**, so the amount charged is final. Orders with an "ask us" delivery fee use cash or transfer.
- **Abandoned online orders are cancelled after 24 hours** so they cannot hold limited stock. A payment that arrives for a cancelled order is still recorded and flagged for refund.
- **Easypaisa is not built**: its notification format is only given to merchants. Guessing a payment-confirmation format is how shops end up with unpaid orders marked paid or paid orders marked unpaid.
- **Refunds stay manual** in each provider's dashboard, then marked on the order.
- **Uploads go browser -> Cloudinary with a short-lived, signed ticket** (folder and file types are part of the signature; the secret never reaches the browser). Photos are still stored as links, so the "paste a link" route keeps working.
- **360° view uses real photographs only** (no generated or interpolated frames): a customer must see the actual item. Frames belong to a finish, 8 to 72 per product, and nothing animates by itself.
- **The website address is not editable in the admin**; it comes from the host's `SITE_URL`, and the admin shows what it currently is, with a warning while it is still a test address.
