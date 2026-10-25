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
- [ ] MANUAL: test on a low-end Android over a slow connection; run Lighthouse on the live URL; record LCP/INP/CLS. Targets: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. **No measurements have been taken yet.**

## Before each release
`npm run lint && npx tsc --noEmit && npm test && npx playwright test && npm run build`
