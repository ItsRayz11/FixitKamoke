# Fixit — Project status (read this first when resuming)

Last updated: 2026-10-25. Master brief: [MASTER_PROMPT_SUMMARY.md](MASTER_PROMPT_SUMMARY.md). Plan: [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).

## Where things stand
The shop is **built and tested, not deployed**. It runs locally against an embedded Postgres, and the production build has also been run against a real Postgres wire connection. It needs the owner's real business information and paid hosting/database accounts before launch (see [LAUNCH_BLOCKERS.md](LAUNCH_BLOCKERS.md)). All product data in the dev/test runs is clearly labelled DEMO.

## What exists (all verified by automated tests)
Storefront (search, categories, product pages with photo gallery, cart, guest checkout, order confirmation and tracking), repair requests with status tracking, contact form, FAQ, policy pages (drafts), blog with four starter guides awaiting review, optional customer accounts (orders, addresses, wishlist, verified reviews, password reset, deletion), retention features (recently viewed, compatible accessories, order again, consent-based email list), admin area with three roles (dashboard, orders, repairs, messages, products, categories, inventory, coupons, delivery zones, blog, reviews, customers, email list, store settings, payments status, email status, staff, audit log), transactional email outbox (Resend adapter, awaiting credentials) including shop alerts, SEO (sitemap, robots, canonical, noindex, structured data), accessibility scans, security headers, row level security.

## Verification
Commands: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npx playwright test`, `npm run build && npm run test:prod`, `npm run check:secrets`. Latest numbers are in the final report.

## Not built / owner decisions
Image upload, marketing campaigns, back-in-stock alerts, online payment gateways, courier integration, Urdu, email verification and 2FA. Details in LAUNCH_BLOCKERS.md.

## Notes for whoever continues
- Next.js 16: `proxy.ts` replaces `middleware.ts`; `cookies()`/`params`/`searchParams` are async; Cache Components is intentionally off; do not remove the Tailwind loader rule in `next.config.ts`.
- Production database driver differs from the embedded one: JSON must be passed as an already-serialised string (handled in `src/lib/db/index.ts`). `tests/integration/postgres-driver.test.ts` guards this. Always add new tables with `alter table … enable row level security` (a test enforces it).
- `NEXT_PUBLIC_*` values are fixed at build time; use `SITE_URL` for the address at run time.
- Playwright gives each test a fresh browser; sign in inside each test. The dev suite shares one server, so specs are order-aware (`a0-setup` first, `zz-*` last).
