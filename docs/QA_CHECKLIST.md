# QA checklist

Automated checks run with `npm test` (Vitest) and `npx playwright test` (browser). `npm run lint`, `npx tsc --noEmit` and `npm run build` must be clean. Items marked MANUAL need a person and a real device.

## Customer journeys (automated)
- [x] Browse, search ignoring case/spacing/dashes, filter, sort, empty states
- [x] Product page: price, stock state, specs, compatible phones, related and compatible accessories, wishlist, reviews
- [x] Cart: add, change quantity, remove, clear with confirmation, persists in the browser
- [x] Guest checkout: server-calculated totals, Kamoki vs out-of-area fee, unlisted city "to be confirmed", COD/bank transfer rules
- [x] Order confirmation, tracking by link or number + phone, wrong phone reveals nothing
- [x] Overselling blocked even with a tampered cart; idempotent retry does not take stock twice
- [x] Repair request, honest wording (estimate vs confirmed price), status page, internal notes hidden
- [x] Contact form, FAQ, policy pages (draft banner until approved), custom 404
- [x] Accounts: register, sign in/out, reset password, addresses, order history, order again, reviews, delete account
- [x] Email list: consent required, unsubscribe, CSV export; ordering does not subscribe

## Admin (automated)
- [x] Anonymous visitors cannot reach any admin URL; setup token required and disabled once used
- [x] Roles: staff cannot open products/settings/users/audit/shipping
- [x] Product create/edit validation keeps typed values on error; draft products are not public or in the sitemap
- [x] Order lifecycle with valid-transition checks and restock on cancel; manual delivery fee required before confirming
- [x] Coupons, categories, inventory, shipping, store settings change the storefront
- [x] Blog: starter guides need review confirmation before publishing; HTML is escaped
- [x] Email status honest when unconfigured; payments page shows no gateway connected

## Security (automated unless noted)
- [x] Passwords hashed (scrypt); sessions stored hashed; reset tokens single-use and short-lived
- [x] No price, total, role or status is accepted from the browser
- [x] Open redirects refused; unsafe map embeds rejected; markdown cannot inject scripts
- [x] Rate limits unit-tested (the browser suite raises them on purpose)
- [ ] MANUAL: confirm secrets are absent from the deployed JS bundles and repository history before launch
- [ ] MANUAL: penetration-style review by a second person

## Accessibility
- [x] axe-core (WCAG 2.0/2.1/2.2 A and AA tags): no serious or critical issues on all public pages, blog and account pages
- [ ] MANUAL: keyboard-only pass, screen reader (NVDA/TalkBack) pass on checkout and repair form, 200% zoom, reduced-motion setting

## Responsive and performance
- [x] No horizontal overflow on key pages at desktop and Pixel 7 sizes
- [ ] MANUAL: test on a real low-end Android over a slow connection; run Lighthouse/PageSpeed on the live URL; record LCP, INP and CLS. Targets: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Only lab numbers on the build machine exist so far (see the production-mode suite below); INP has not been measured at all.

## Production-mode suite (`npm run build && npm run test:prod`)
- [x] Runs the real build against a real Postgres wire connection with no demo/test switches
- [x] Test/seed endpoints return 404; security headers, CSP and HSTS present; robots/sitemap correct
- [x] Fresh shop shows honest empty states; owner setup; configure delivery + product; guest order; stock drops
- [x] Rendered pages contain no server secret; customer-entered markup and SQL-like text are inert
- [x] Repeated wrong admin sign-ins are throttled under production limits
- [x] Lab performance on slow 4G + 4x CPU, mobile viewport (localhost server): LCP about 0.85-1.0 s, CLS at most 0.036, JS about 175 KB, no product photos yet. Re-measure on the live site.
- [x] `npm run check:secrets` builds with sentinel secrets and finds none in client files

## Link integrity (dev suite)
- [x] Crawler follows every storefront link (36 pages) and every admin link as owner (29 pages): no broken page and no console error

## V2 mobile-first checks (all automated unless noted)
- [x] No horizontal overflow or elements wider than the screen at 320, 360, 393, 414 px on home, shop, category, two product pages, cart, checkout, compare, repairs, track (desktop and Pixel 7 projects)
- [x] Finish choice swaps real photo/price/stock/URL; arrow-key operable; sold-out finish labelled and unbuyable; required finish guided; order line records the finish
- [x] Purchase bar: phone only, appears when the main button is off screen, hides while a field is focused
- [x] Cart confirmation: continue shopping and open cart; reduced-motion still works; stage tilt off under reduced motion
- [x] Touch targets at least 44px for the main product controls; axe (WCAG 2.2 AA) on home, shop, product with finishes, compare
- [x] Funnel events stored without personal data; admin Funnel shows "not enough data" for small samples
- [x] Production build suite (10 tests) and secret scan pass after V2. Lab numbers after V2 (slow 4G, 4x CPU): LCP 1.07-1.24 s, CLS 0 (0.038 cart), JS about 190 KB. Re-measure on the live site.
- [ ] Real iPhone/Android pass (dynamic toolbar, notch, keyboard over checkout form, thumb reach), low-end phone pass, screen-reader pass: owed to a person with devices

## Before each release
`npm run lint && npx tsc --noEmit && npm test && npx playwright test && npm run build`
