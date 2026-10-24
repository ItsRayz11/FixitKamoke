# Fixit — Project Status (read this first when resuming)

Master brief: see [MASTER_PROMPT_SUMMARY.md](MASTER_PROMPT_SUMMARY.md). Update this file at the end of every phase.

Last updated: 2026-10-24

## Honest state
Backend foundation exists and is tested. **No customer-facing pages or admin UI are built yet** (the app still shows the Next.js starter page).

Built and verified (2026-10-25): `npm test` 27/27 pass (20 unit, 7 integration on embedded Postgres), `tsc --noEmit` clean, `eslint` clean, baseline `next build` passed on the starter.
- `src/lib/domain/*`: money (integer PKR), Pakistani phone normalisation, shipping zones/quotes, pricing + coupons, order state machine.
- `db/migrations/001_init.sql`: full schema (products, orders, order_items snapshot, status history, repairs, blog, admin, audit, consent, outbox, settings).
- `src/lib/db`: PGlite (dev/test) and postgres.js (DATABASE_URL) adapters, migration runner.
- `src/lib/orders/create-order.ts`: server-authoritative totals, atomic stock decrement, idempotency, coupon + shipping + COD rules, outbox row.

Next.js 16 notes (from bundled docs): `middleware.ts` is now `proxy.ts`; `cookies()` is async.

## Phase checklist
| # | Phase | Status |
|---|-------|--------|
| 0 | Repo/environment audit | Done (empty folder, Node 24.19, npm 11.17, git; no Docker/psql) |
| 0 | Docs set (blueprint, roadmap, architecture, decision log, QA, deployment, launch blockers) | Not started |
| 1 | Architecture decisions | Drafted (below), not yet in DECISION_LOG |
| 2 | Design system | Not started |
| 3-4 | Site map, homepage, search | Not started |
| 5 | Catalogue and inventory | Schema done; queries/UI not started |
| 6-7 | Cart, checkout, shipping | Server order logic done + tested; cart/checkout UI not started |
| 8 | Repair workflow | Not started |
| 9 | WhatsApp / Maps / social config | Not started |
| 10 | Retention | Not started |
| 11 | Blog and SEO | Not started |
| 12 | About / founder | Not started |
| 13 | Admin | Not started |
| 14 | Email (Resend) | Not started |
| 15 | Animation | Not started |
| 17-19 | A11y, performance, security, tests | Not started |
| 20 | Deployment | Not started (needs owner credentials) |
| 21 | Final audit | Not started |

## Decisions so far
- App in `E:\New folder\fixit` (Next.js 16, React 19, Tailwind 4, TypeScript).
- Postgres with versioned SQL migrations. Production: Supabase Postgres (or Neon). Local/tests: embedded PGlite, because no Docker/Postgres is installed.
- Admin auth: own scrypt + signed httpOnly cookie sessions with roles and audit log.
- Customer accounts: optional, later.

## Needed from the owner (never invented)
WhatsApp number, shop address and map link, opening hours, real products/prices/stock, shipping rates, policies, social profile URLs, domain choice, Resend/Supabase/hosting credentials, founder photo/bio approval.
