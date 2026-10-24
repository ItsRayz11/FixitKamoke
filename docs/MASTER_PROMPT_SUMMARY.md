# Fixit master brief (condensed from the owner's full prompt)

Business: Fixit, mobile repair + accessories shop, Kamoki, Punjab, Pakistan. Founder Ali Hassan. Currency PKR (integers only). English first, Urdu/Roman Urdu later. Domains to check (not assume): fixit.com, fixitkamoki.com. Support via WhatsApp.

## Priorities
1. Qualified orders and repair inquiries 2. Fast, trustworthy mobile shopping 3. Repeat purchases 4. Local brand credibility 5. Organic search 6. Low cost/complexity 7. Scalable without rebuild.

## Hard rules
- Never invent inventory, prices, reviews, warranties, repair success rates, delivery promises, addresses, phone numbers, social handles, founder bio.
- No fake payments, fake success messages, fake analytics, fake trust badges, fake scarcity.
- Server calculates all totals; validates stock; immutable order-item snapshots; transaction + idempotency; auditable state machine.
- No secrets in client code or Git; `.env.example` with placeholders only.
- Plan first, build one phase at a time, test/review each, fix defects, then continue. No fake "complete": feature needing credentials = "implemented but awaiting configuration".
- Ask questions only when truly blocked; batch them. Do not claim tests/deploys that were not run.
- No destructive repo operations without authorization. Do not deploy on a plan that forbids commercial use.

## Stack preference
Next.js App Router, TypeScript, Tailwind, shadcn/ui, Motion (selective), Supabase Postgres (compare Appwrite), Resend, Zod, Playwright, Vitest.

## Design
Graphite/navy + white, electric-blue accent, subtle cyan. Glass only for nav/cart/modals; no neumorphism on controls. Design tokens, accessible components, WCAG 2.2 AA, reduced motion, Core Web Vitals targets (LCP 2.5s, INP 200ms, CLS 0.1) measured not claimed.

## Scope
Public: home, shop, categories, product, search, cart, checkout, confirmation, order tracking, repair services + booking, about, contact, FAQ, shipping/returns/warranty/privacy/terms, blog + articles, optional account, 404/error/maintenance.
Admin (protected): dashboard, products, categories, inventory, pricing/discounts, orders + status, shipping config, repair inquiries/status, customers, coupons, blog, review moderation, homepage content, settings, email status, analytics, audit logs.

## Key behaviours
- Checkout: guest, COD first, PK phone validation, delivery configurable (Kamoki free delivery is proposed, owner must confirm), no undisclosed fees.
- Repair: separate workflow, unique reference, estimate vs confirmed price, token-protected tracking.
- WhatsApp/Maps/social: central config, no guessed values.
- Retention: recently viewed, related/compatible products, persistent cart, tracking, consent-based email only.
- Blog + SEO: draft/published, sitemap, canonical, structured data (no fake ratings), original accurate articles.
- Email: Resend via server, outbox pattern, no fake emails when unconfigured.
- Security: RLS/least privilege, rate limiting, upload validation, audit logs.
- Tests: unit (pricing, shipping, phone, state machine), integration (orders, stock), Playwright (15 journeys listed in the original prompt).

## Docs to create in /docs
PROJECT_BLUEPRINT, IMPLEMENTATION_ROADMAP, ARCHITECTURE, DECISION_LOG, QA_CHECKLIST, DEPLOYMENT_GUIDE, LAUNCH_BLOCKERS, PROJECT_STATUS.

## Final report sections
A Executive summary, B Architecture, C Features, D Quality verification, E Deployment, F Owner actions, G Outstanding issues, H Costs, I Maintenance, J Launch verdict.
