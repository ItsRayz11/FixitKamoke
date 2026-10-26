# Fixit — Project status (read this first when resuming)

Last updated: 2026-10-25. Master brief: [MASTER_PROMPT_SUMMARY.md](MASTER_PROMPT_SUMMARY.md). Plan: [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).

## Where things stand
The shop is **built and tested, not deployed**. It runs locally against an embedded Postgres, and the production build has also been run against a real Postgres wire connection. It needs the owner's real business information and paid hosting/database accounts before launch (see [LAUNCH_BLOCKERS.md](LAUNCH_BLOCKERS.md)). All product data in the dev/test runs is clearly labelled DEMO.

## What exists (all verified by automated tests)
Storefront (search, categories, product pages with photo gallery, cart, guest checkout, order confirmation and tracking), repair requests with status tracking, contact form, FAQ, policy pages (drafts), blog with four starter guides awaiting review, optional customer accounts (orders, addresses, wishlist, verified reviews, password reset, deletion), retention features (recently viewed, compatible accessories, order again, consent-based email list), admin area with three roles (dashboard, orders, repairs, messages, products, categories, inventory, coupons, delivery zones, blog, reviews, customers, email list, store settings, payments status, email status, staff, audit log), transactional email outbox (Resend adapter, awaiting credentials) including shop alerts, SEO (sitemap, robots, canonical, noindex, structured data), accessibility scans, security headers, row level security.

## V2 addendum (mobile-first Liquid Glass + Titanium): built 2026-10-25
Traceability of every V2 requirement is in [V2_REQUIREMENTS_CHECKLIST.md](V2_REQUIREMENTS_CHECKLIST.md); the saved brief is [MASTER_PROMPT_V2.md](MASTER_PROMPT_V2.md). Added: design-token system (glass, titanium, holographic accents, tactile buttons), glass header with phone menu and search drawers, finish/colour choice backed by real per-finish products and photos, the 13-step mobile product page with a compact purchase bar and confirmation (continue shopping / open cart), reordered homepage with real-data categories and sections, category chips, compare page, cart and checkout progress steps and sticky totals, signature motion (Titanium Spotlight, Liquid Glass Reveal, Tactile Purchase Response), richer privacy-minimal funnel events with an admin Funnel report, and an admin Phone preview frame. Migration `007_variants_events.sql`. Photo rules: [PRODUCT_PHOTOGRAPHY_GUIDE.md](PRODUCT_PHOTOGRAPHY_GUIDE.md).

## V2 follow-up: cross-check, admin on phones, back-in-stock, two-step sign-in (2026-10-25)
- **Admin rebuilt for phones.** Desktop: grouped titanium sidebar with the active page marked. Phones/tablets: glass top bar, bottom tab bar (Dashboard, Orders, Repairs, Messages, More) with waiting-count badges, and a full menu drawer. Every admin table becomes labelled cards below 640px. Tested on 22 admin pages at 320/360/393/414px plus order, repair and product detail pages.
- **Cross-check fixes:** finishes are now named wherever admin or the homepage lists a product (Products, Inventory, Reviews, low-stock); reviews are shared across finishes of one product and tagged with the finish; phone-preview page selector no longer pushes the page wider than a phone; admin bars are near-opaque so text contrast is guaranteed.
- **Back-in-stock alerts** (`008_stock_alerts.sql`): a sold-out item or finish offers "Notify me"; one email is queued when stock returns by any route (admin edit, inventory page, cancelled-order restock, or the outbox run). Transactional, not marketing; the address is deleted within 30 days. Admin → Inventory shows how many are waiting.
- **Two-step sign-in for staff** (`009_two_factor.sql`, optional, needs `TWO_FACTOR_KEY`): authenticator app (RFC 6238, verified against the published test vectors), encrypted secret, single-use recovery codes, five tries per sign-in, replay protection, password + code required to turn off, owner can reset a locked-out colleague. Admin → Account security.

## Follow-up 2: uploads, 360°, online payments, manual-payment proof (2026-10-25)
- **Photo upload (Cloudinary):** signed direct-to-Cloudinary upload in Admin -> Products; the storefront asks Cloudinary for right-sized `f_auto,q_auto` copies. Needs the three `CLOUDINARY_*` settings.
- **360° turntable viewer** (`product_images.kind = 'spin'`, migration 010): per finish; drag, swipe, keys and buttons; 8 to 72 real frames; no autoplay.
- **Online payments** (migration 010): Safepay and JazzCash adapters (signed webhook / signed return); Easypaisa not built. An order becomes paid only on a signature-verified message that matches our reference and the exact amount. A gateway goes off -> testing (staff only) -> live, and "live" is locked until a verified test payment exists. Admin -> Payments shows status, callback addresses, orders awaiting payment and a log of everything providers sent. Abandoned online orders are cancelled after 24h and their stock returned.
- **Manual payments:** "Other ways to pay by hand" setting (wallet numbers) and a transaction-ID box on the order page; staff see "payment to check". The dashboard shows "Waiting for payment".
- **Website address** card in Store settings (the domain comes from `SITE_URL` on the host).
- Guide for all of this plus real-phone checks: [GO_LIVE_GUIDE.md](GO_LIVE_GUIDE.md).

## Verification
Commands: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npx playwright test`, `npm run build && npm run test:prod`, `npm run check:secrets`. Latest numbers are in the final report.

## Not built / owner decisions
Easypaisa gateway (needs the merchant guide), A/B testing (traffic too low), marketing email campaigns, courier integration, Urdu, customer email verification, shared multi-server rate limiting. (Built later: back-in-stock alerts, staff 2FA, upload, 360° view, Safepay and JazzCash adapters.) Details in LAUNCH_BLOCKERS.md.

## Notes for whoever continues
- Next.js 16: `proxy.ts` replaces `middleware.ts`; `cookies()`/`params`/`searchParams` are async; Cache Components is intentionally off; do not remove the Tailwind loader rule in `next.config.ts`.
- Production database driver differs from the embedded one: JSON must be passed as an already-serialised string (handled in `src/lib/db/index.ts`). `tests/integration/postgres-driver.test.ts` guards this. Always add new tables with `alter table … enable row level security` (a test enforces it).
- `NEXT_PUBLIC_*` values are fixed at build time; use `SITE_URL` for the address at run time.
- Playwright gives each test a fresh browser; sign in inside each test. The dev suite shares one server, so specs are order-aware (`a0-setup` first, `zz-*` last).
