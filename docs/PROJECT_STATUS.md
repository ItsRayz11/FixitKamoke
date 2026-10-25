# Fixit — Project Status (read this first when resuming)

Master brief: see [MASTER_PROMPT_SUMMARY.md](MASTER_PROMPT_SUMMARY.md). Update this file at the end of every phase.

Last updated: 2026-10-25

## Honest state
Working today (verified): storefront browse/search/product pages, browser cart, guest checkout with server-authoritative totals, order confirmation, order tracking (order number + phone), shipping rules, stock protection. Uses **demo data only** (`NEXT_PUBLIC_DEMO_MODE=1`, POST /api/dev/seed). No real inventory, prices, phone, address or policies exist yet.

NOT built yet: repair booking, blog, policy/about/contact/FAQ pages, admin area + auth, email sending, SEO files (sitemap/robots), custom 404, accounts, analytics, docs set, deployment.

Verification run 2026-10-25: tsc clean, eslint clean, vitest 27/27, `next build` clean (0 warnings), Playwright desktop 7/7 journeys + 14/14 layout/overflow checks (desktop + Pixel 7).

Architecture notes: `cacheComponents` disabled (pages dynamic); Next 16 uses `proxy.ts` not `middleware.ts`; async `cookies()`; Tailwind v4 via the scaffold's `@tailwindcss/turbopack` rule in next.config.ts (do not remove). Production migrations: `DATABASE_URL=... npm run db:migrate`. In-memory rate limiter is per-process only.

## Phase checklist
| # | Phase | Status |
|---|-------|--------|
| 0 | Repo/environment audit | Done (empty folder, Node 24.19, npm 11.17, git; no Docker/psql) |
| 0 | Docs set (blueprint, roadmap, architecture, decision log, QA, deployment, launch blockers) | Not started |
| 1 | Architecture decisions | Drafted (below), not yet in DECISION_LOG |
| 2 | Design system | Tokens + header/footer/cards/toast done; no shadcn, no dialogs/drawers yet |
| 3-4 | Site map, homepage, search | Home, shop+filters, product, cart, checkout, order, track done; rest of site map not started |
| 5 | Catalogue and inventory | Public catalogue done; admin product management not started |
| 6-7 | Cart, checkout, shipping | Done and tested (COD + bank transfer; no online payment gateway by design) |
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
