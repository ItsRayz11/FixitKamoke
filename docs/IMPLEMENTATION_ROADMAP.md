# Fixit — Implementation Roadmap

Rule: build one phase, cross-check it (types, lint, unit/integration/e2e, browser look, security, a11y), fix defects, update PROJECT_STATUS.md, then continue. A phase is not done because its UI exists.

Owner approvals (2026-10-25): build everything in this list, including customer accounts, shadcn/ui, payment-gateway layer (COD + bank transfer live; gateways disabled until merchant credentials), English first with Urdu later.

| Phase | Scope | Status |
|---|---|---|
| A | Foundation, domain logic, schema, orders, storefront, cart, checkout, tracking | DONE (2026-10-25) |
| B | DB-backed store settings; auth core (scrypt, sessions); admin login + owner setup; role guards; audit log | DONE (2026-10-25) |
| C | Admin: dashboard, products, categories, inventory, orders (status machine + restock), coupons, shipping editor, store settings, users, audit, customers, reviews | DONE except repairs/blog/email pages (phases D, F, G) |
| D | Repair booking (public) + token tracking + admin repair management | DONE (2026-10-25) |
| E | Content pages: about, contact+map, FAQ, 5 policies (drafts, flagged unapproved), 404/error/maintenance | DONE (2026-10-25); axe scan clean on 13 public pages |
| F | Blog: model, admin editor, public pages, 4 original articles (drafts for owner review) | DONE (2026-10-25) |
| G | Email: Resend adapter, outbox processor, templates, admin email status | DONE (2026-10-25); implemented but awaiting Resend credentials, tested with an injected sender only |
| H | SEO: sitemap, robots, metadata, JSON-LD, noindex private pages | DONE (2026-10-25) |
| I | Customer accounts: register/login, order history, addresses, wishlist, reviews, password reset, deletion | DONE (2026-10-25) |
| J | Retention: recently viewed, compatible accessories, order again, consent-based email list + unsubscribe + CSV, privacy-minimal funnel events | DONE (2026-10-25); campaign sending and back-in-stock alerts not built |
| K | Payments layer: provider interface, bank-transfer details, payment status, gateway adapters disabled | DONE (2026-10-25); gateways intentionally not connected |
| L | shadcn/ui primitives (dialog, sheet, accordion), Motion animations, reduced-motion | DONE (2026-10-25); drawer + confirm dialogs on Radix, Motion toast, CSS reveals. shadcn CLI registry was unreachable, so equivalent components were written by hand |
| M | Security pass (authz tests, headers, upload rules, rate limits), accessibility pass, performance measurement | DONE (2026-10-25); production-mode suite, CSP/HSTS, RLS, secret scan, throttled lab performance numbers; manual device/screen-reader passes still owed |
| N | Docs set + deployment guide + launch blockers | DONE (2026-10-25) |
| O | Final in-depth cross-audit of everything; fix; final report | DONE (2026-10-25) |

## V2 addendum (mobile-first, liquid glass + titanium) — started 2026-10-25
Source: [MASTER_PROMPT_V2.md](MASTER_PROMPT_V2.md). Traceability: [V2_REQUIREMENTS_CHECKLIST.md](V2_REQUIREMENTS_CHECKLIST.md). Same rule: build a phase, cross-check it (lint, tsc, tests, browser at 320/360/390/414), fix, then continue.

| Phase | Scope | Status |
|---|---|---|
| V2-1 | Design system: titanium/glass/holographic tokens, utilities, motion CSS, glass header + mobile nav drawer | DONE (2026-10-25) |
| V2-2 | Data: finish/variant model (linked products with real images), admin form, new funnel events, demo seed variants | DONE (2026-10-25) |
| V2-3 | Mobile product page in the specified 13-step order, finish selector, sticky purchase bar, cart confirmation | DONE (2026-10-25) |
| V2-4 | Mobile homepage (11-step order) and category/shop listing | DONE (2026-10-25) |
| V2-5 | Cart and checkout layouts: progress, always-visible totals, input preserved on errors | DONE (2026-10-25) |
| V2-6 | Shared motion system: Titanium Spotlight, Liquid Glass Reveal, Tactile Purchase Response | DONE (2026-10-25) |
| V2-7 | Retention + measurement: funnel events, admin funnel report, compare, post-purchase help | DONE (2026-10-25) |
| V2-8 | Admin phone-frame design-review preview | DONE (2026-10-25) |
| V2-9 | Test pass: unit, integration, e2e at 320/360/393/414, axe, reduced motion, regression | DONE (2026-10-25) |
| V2-10 | Docs update and final in-depth audit of every phase | DONE (2026-10-25) |
| V2-11 | Cross-check pass: finish names in admin, reviews across finishes, preview overflow, contrast | DONE (2026-10-25) |
| V2-12 | Admin rebuilt mobile-first: sidebar, bottom tabs, menu drawer, table cards, tested at 4 widths | DONE (2026-10-25) |
| V2-13 | Back-in-stock alerts (migration 008) | DONE (2026-10-25) |
| V2-14 | Optional two-step sign-in for staff (migration 009) | DONE (2026-10-25) |
| V2-15 | Cloudinary upload and optimised delivery | DONE (2026-10-25) |
| V2-16 | 360° turntable viewer (migration 010) | DONE (2026-10-25) |
| V2-17 | Online payments: Safepay + JazzCash adapters, testing gate, settlement, expiry; manual payment proof | DONE (2026-10-25); live-account test owed |
| V2-18 | Go-live guide: Neon, hosting settings, gateways, turntable, real-phone checklist | DONE (2026-10-25) |
