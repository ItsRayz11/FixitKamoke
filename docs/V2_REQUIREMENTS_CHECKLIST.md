# V2 requirements: traceability

Source: [MASTER_PROMPT_V2.md](MASTER_PROMPT_V2.md). Legend: **Implemented + tested** = in the code and covered by an automated test in this repo. **Implemented, manual check owed** = in the code, needs a real device/person. **Owner input** = needs your content or accounts. **Not built** = deliberately left out (reason given).

| § | Requirement | Status | Where / evidence |
|---|---|---|---|
| 1 | Liquid Glass + Titanium design language, holographic accents, tactile controls, restrained lighting | Implemented, manual design review owed | `src/app/globals.css` tokens + `@layer components` (glass, titanium, stage, holo-edge, sweep, btn-*); header, drawers, hero, cards |
| 2 | Mobile-first; widths 320/360/393/414 tested | Implemented + tested | `e2e/v2.spec.ts` overflow + clipped-element check on 10 pages at 4 widths, both desktop and Pixel 7 projects; `viewport-fit=cover`, `100dvh`, safe-area variables |
| 2 | Phone-frame review preview (status bar, inset, independent scroll, home indicator, width compare, controls) | Implemented + tested | Admin → Phone preview (`src/components/admin/phone-preview.tsx`); test "admin phone preview frames the storefront" |
| 2 | Production site renders at the real width (not framed) | Implemented | No frame in storefront; preview is admin-only |
| 3 | Product page in the 13-step order, single column on phones, image first | Implemented + tested | `product/[slug]/page.tsx` + `product-showcase.tsx` |
| 3 | Compact purchase bar, safe-area aware, never covers fields | Implemented + tested (desktop hidden / phone shown / hides for a focused field) | `.purchase-bar`, test "purchase bar appears…" |
| 3 | Mandatory options guided before add | Implemented + tested | `variant_required`; test "required finish must be chosen first" |
| 3 | Immediate cart response + confirmation with continue/open cart | Implemented + tested | `cart-toast.tsx`; test "cart confirmation offers both next steps" |
| 4A–E | Psychological principles (immediate understanding, less effort, confidence, responsive interaction, reasons to return) | Implemented | Hero value proposition + two CTAs; category chips; compare page; real stock/price/delivery; no invented reviews/scarcity/discounts; recently viewed, compatible accessories, tracking, guides |
| 4C | Never invent reviews, sales numbers, scarcity, discounts, ratings | Implemented + tested | Reviews section absent with zero approved reviews (test "homepage … shows only real data"); "Only N left" appears only from real stock ≤ 3; JSON-LD carries no ratings |
| 5 | Titanium Spotlight (desktop tilt, static on mobile/reduced motion) | Implemented + tested (reduced motion) | `src/components/ui/spotlight.tsx` |
| 5 | Liquid Glass Reveal (nav, filter, cart overlays) | Implemented + tested | `Sheet` side drawers (menu, search, filters), closing animations; test "mobile menu drawer…" and existing filter-drawer tests |
| 5 | Tactile Purchase Response (press, confirmation, indicator bump) | Implemented + tested | `.btn:active`, `btn-done` "Added" state, `CartBadge` bump, confirmation panel |
| 5 | Reduced motion respected; no continuous animation | Implemented + tested | `prefers-reduced-motion` rules; only one-off sweep; test "reduced motion…" |
| 5 | Test on low-powered devices | **Owner/manual** | Animations are transform/opacity only; a real low-end phone pass is still owed |
| 6 | Real photos, consistent imagery rules | **Owner input** | [PRODUCT_PHOTOGRAPHY_GUIDE.md](PRODUCT_PHOTOGRAPHY_GUIDE.md); no generated product art is used |
| 6 | No colour selector that only changes a label | Implemented + tested | Finish = separate product with its own photos; test "choosing one swaps the real photo, price, stock and address" |
| 6 | 3D / 360° rotation | Implemented + tested (needs the owner's real turntable photos) | `spin-viewer.tsx`, `e2e/media.spec.ts`; per-finish frames; drag, swipe, keys, buttons; no autoplay |
| 7 | Homepage in the 11-step order | Implemented + tested | `(shop)/page.tsx`; test "homepage follows the mobile order" |
| 7 | Popular categories from real inventory and interest | Implemented + tested | `popularCategories()` (views + in-stock counts) |
| 8 | Guest checkout, minimal fields, subtotal + shipping + final before commit, no hidden fee, preserved input, no fake success | Implemented + tested | Checkout (existing logic, now with progress steps and a total bar); existing journey tests; `track("checkout_error")` |
| 8 | COD only if fulfillable | Implemented | Per delivery zone flag |
| 9 | Retention list in priority order | Implemented | Cart persistence (localStorage), confirmation + tracking, compatible accessories, recently viewed, order page links to guides/WhatsApp, guides on product page and home, consent-based list (unchecked by default), wishlist/accounts |
| 9 | No fake countdowns/scarcity, preselected consent, obstructive unsubscribe | Implemented | Existing consent tests; nothing of the kind exists |
| 10 | Measurable baseline: listing→detail, detail→cart, cart→checkout, completion, mobile form errors, cancellation, repeat purchase, repair conversion | Implemented + tested | Admin → Funnel; `tests/integration/variants.test.ts` (events), e2e "funnel events…" |
| 10 | Privacy-conscious analytics; no fabricated metrics | Implemented + tested | Count-only, DNT/GPC honoured, ratios hidden until 30 events |
| 10 | Controlled experiments when traffic allows | Not built (stated honestly) | Admin → Funnel explains why no A/B test runs |
| 10 | Test widths, keyboard, touch, reduced motion, slow connection, realistic imagery | Partly | Widths, keyboard (arrow keys), 44px targets, reduced motion automated; slow-network lab numbers in QA_CHECKLIST (re-measure); realistic imagery needs real photos; real-phone pass owed |
| 11 | Inspect first, don't rebuild working code, implement in the repo, distinguish prototype/implemented/configured/verified | Done | This table; existing 99 tests kept green |
