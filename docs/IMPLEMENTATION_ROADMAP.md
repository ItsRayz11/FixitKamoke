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
| K | Payments layer: provider interface, bank-transfer details, payment status, gateway adapters disabled | todo |
| L | shadcn/ui primitives (dialog, sheet, accordion), Motion animations, reduced-motion | todo |
| M | Security pass (authz tests, headers, upload rules, rate limits), accessibility pass, performance measurement | todo |
| N | Docs set + deployment guide + launch blockers | todo |
| O | Final in-depth cross-audit of everything; fix; final report | todo |
