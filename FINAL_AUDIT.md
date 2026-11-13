# Fixit: final audit and upgrade report

Date: 2026-11-13. Site: https://fixit-kamoke.vercel.app. Written for the owner and for whoever continues the work.

**Where things stand:** the store was already a complete, tested shop. This pass audited it, fixed live defects, and built the missing business features (cash-on-delivery advance, wallet payments, courier and refunds, discounts, repair approval, a clearer admin). **Production was not changed by this work** except one incident, described in section 3.

---

## A. Implemented changes (what is actually in the code)

**Phase 8: COD advance.** Owner chooses none, one-third, half, a custom percentage or a fixed amount, with an optional minimum order and per-zone on/off. Worked out on the final total in whole rupees, rounded up, never above the total; the browser never sends it. Checkout shows pay-now and pay-on-delivery. Staff verify the amount actually received (recorded with who and when). A COD order with an unpaid advance cannot be confirmed. Off by default; only affects new orders.

**Phase 7: payments.** Admin Payments is now one card per method (Cash on delivery, Bank transfer, JazzCash transfer, Easypaisa transfer, Safepay, JazzCash merchant, Easypaisa merchant) with a status badge (Active / Off / Setup required / Testing / Error / Not available), an on/off switch, and an expandable Configure panel. JazzCash and Easypaisa wallet transfers are real checkout methods (title and number configurable) and wait for staff to verify. A wallet with no number cannot be switched on. Technical details and logs are tucked into expandable sections.

**Phase 5: discounts.** Sale price with optional start and end dates (Pakistan time); a real percent-off badge computed from the two prices. Coupons: percent, fixed, free delivery; minimum order; maximum discount; start and end; total limit; per-customer limit (by phone or account); one category only; allow or refuse with sale prices. Documented calculation order (sale price, then coupon on the sale price, then delivery). Everything is checked on the server; checkout previews the saving.

**Phase 9: orders.** Stages Packed and Out for delivery (optional); courier and tracking number (entered by hand) shown to the customer and in the dispatch email; internal staff notes; COD balance collection recorded exactly; refunds recorded (managers and owners only) and capped at what was received; partly and fully refunded states; "next step" banner on every order; transfer, wallet and online orders cannot be confirmed until the payment is marked paid.

**Phase 10: shipping.** Zones can be switched off, can switch the advance off, and are validated (same city in two active zones, backwards delivery times, free-delivery threshold of zero). The fallback rule for unlisted cities is stated at the top.

**Phase 11: email.** Overview with Connection, Sender, waiting, sent and failed; a real "send test email" action; the connection is "Connected" only after the provider accepts a test. Setup checklist computed from the server. New messages: payment received, advance received, out for delivery, refund, contact acknowledgement; order-received now says clearly when payment is awaited. Stale messages are dropped (for example "confirmed" for an order cancelled in the meantime).

**Phase 12: repairs.** A four-step guide, and the customer approves or declines the price on their private status page. Approval is for one exact amount; if the price changes it must be given again. Work cannot start without it; staff can record a phone approval by booking the repair in.

**Phase 4: admin.** Sidebar regrouped as in the brief, icons on every item, collapsible groups (animated), icon-only mode with tooltips, remembered per browser. Dashboard with real KPIs (today's orders, pending, awaiting advance, awaiting payment, ready to ship, low stock, pending repairs, unread messages), role-aware quick actions, and a 14-day orders chart that appears only when there are orders. The product editor is split into Basics, Pricing, Inventory, Media, Variants, SEO and Publishing (Draft / Active / Archived), with a live discount preview, live photo previews, drag-and-drop upload, and a save bar that is always visible. SEO title and description are used on the storefront.

**Phases 2, 3, 14: storefront.** Shorter homepage headline and supporting line, "Shop now" and "Book a repair", category icons, a Special offers section (only genuinely discounted products), a "Why shop with Fixit" section that states only things the shop really does, percent-off badges, Quick View on every product card, photo zoom (hover magnify with a mouse, a Zoom button for touch and keyboard). Existing motion, skeletons, toasts, cart badge and reduced-motion support were kept.

**Phase 16: configuration.** The site address no longer falls back to `localhost:3000` on Vercel (production uses the project's production domain, previews their own address). Environment variables are documented in `.env.example`; the missing ones are listed in section G.

**Overflow fix.** A global rule lets fieldsets shrink and long words wrap, and grid children can shrink, which removes the sideways overflow in the product editor's 360° section. Verified at 320, 360, 393 and 414 px across 22 admin pages and the storefront.

## B. Existing features verified (already present and working)
Storefront search, categories, product pages with galleries and 360° view, guest checkout, order tracking, accounts, reviews, blog, FAQ, policy pages, newsletter, stock alerts, compare, three staff roles, staff two-step sign-in, audit log, row level security, signed Safepay and JazzCash webhooks with idempotent settlement, Cloudinary uploads, security headers, rate limits, sitemap, robots, structured data, accessibility scans.

## C. Issues found and fixed
1. **Site URL fell back to localhost on Vercel.** `SITE_URL` is not set in the Vercel Production environment. Fixed in code (takes effect on the next deploy). Setting `SITE_URL` explicitly is still recommended.
2. **Fieldset text overflow** in the product editor (360° section). Fixed globally.
3. **Dashboard** counted COD advances inconsistently and linked staff to pages they cannot open. Fixed.
4. **Test tooling could reach the live database** (section 3). Fixed so it cannot happen again.
5. Smaller defects found by the new tests: audit writes in two order functions used the wrong database handle; a stale-email path could send a "confirmed" message for a cancelled order.

## D. Payment integration status
| Method | State |
|---|---|
| Cash on delivery (with optional advance) | Works. Advance is verified by staff. |
| Bank transfer | Works. Manual verification by staff. Needs the owner's account details. |
| JazzCash / Easypaisa wallet transfer | Works. Manual verification by staff. Needs the owner's wallet numbers. |
| Safepay | Adapter built and tested with signed test messages. **Never run against a real merchant account.** Needs a merchant account, sandbox credentials, a sandbox test payment, then owner approval to go live. |
| JazzCash merchant | Same as Safepay. |
| Easypaisa merchant | **Not built.** Needs the merchant integration guide. |

No gateway can reach customers until a signature-verified test payment has been received. Refunds through gateways are made in the provider's dashboard and then recorded here.

## E. Email status
Sending is **not verified**: no `RESEND_API_KEY` or `EMAIL_FROM` is set on the host, so nothing is sent and the admin says "Setup required". All message content and the stale-message rules are tested with a fake sender. After the owner sets the two variables, press "Send test email" in Admin > Email; it only shows "Connected" if the provider accepts it.

## F. Testing results
Run on this machine (Windows, Node 24), all against throwaway in-memory databases:
- Typecheck, lint: pass.
- Unit and integration tests: **242 passed** (30 files).
- Production build: pass. Secret scan (no server secret in any client bundle): pass.
- Production-mode suite (real Postgres driver, applies migrations 001 to 016): **10 passed**. Performance on a throttled phone profile: LCP 1.05 to 1.26 s (target 2.5 s), CLS at most 0.04 (target 0.1).
- Full browser suite, desktop and phone profiles: one full run (desktop and phone profiles, about 190 tests) had 163 passing and 6 failing, with 22 not run because they follow a failure in the same file. The failures were: a real mobile layout bug (the new Save bar could cover the Delete button; fixed), two tests still expecting the old headline or finding a value twice (updated), a test timing race (fixed), and two dev-server timing flakes in the account specs. Every spec that failed or did not run was re-run after the fixes and passes (accounts 13 of 13, fulfilment, payment, two-factor, journey on desktop; the interface spec on the phone profile). A complete single run of the whole suite after the final fixes was not repeated.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Not done: real iPhone and Android devices, screen-reader pass, any test against the live site, any live payment or live email.

## G. Owner action checklist (only the owner can do these)
1. **Decide about the live data** (section 3): the demo products and demo delivery zones currently visible on the live site.
2. **Back up Neon**, then run the migrations (docs/MIGRATION_REVIEW_011_016.md). Not done yet.
3. In Vercel (Production): set `SITE_URL=https://fixit-kamoke.vercel.app`, `ADMIN_SETUP_TOKEN` (16+ characters) and `TWO_FACTOR_KEY` (32+ random characters), then redeploy. Create the owner at `/admin/setup`, then remove the setup token.
4. Resend account, verified sending domain, `RESEND_API_KEY`, `EMAIL_FROM`; then "Send test email".
5. Bank account details and wallet numbers (Admin > Payments).
6. Decide the COD advance rule (Admin > Payments > Cash on delivery > Configure).
7. Real delivery zones and fees; real product photos; return, refund and warranty wording; approve the policy pages.
8. Merchant accounts and sandbox credentials if online payments are wanted; Easypaisa needs its integration guide.
9. Tell staff: repairs now need the customer's approval before work starts, and non-COD orders must be marked paid before confirming.

## H. Deployment status
**Nothing was deployed.** Production code and the production database schema are unchanged. Migrations 011 to 016 were not run on production. See docs/MIGRATION_REVIEW_011_016.md for the backup, rehearsal and rollback plan.

## I. Remaining limitations (honest list)
- Customer photo upload on repair requests: not built (needs a public upload endpoint with abuse controls).
- COD advance by product, category or customer risk rules: not built (zone and minimum-order rules exist).
- Advance paid through an online gateway: not built; advances are by transfer or wallet.
- Coupon rules by shipping zone: not built. Stacking is one switch (with or without sale prices), not a full rule table.
- Courier integration, label printing, automatic tracking: not built; courier and tracking are entered by hand.
- Image zoom is a magnifier plus a large view, not pinch-to-zoom.
- "Awaiting advance" is shown as a "Next step" banner and a payment state rather than its own order stage.
- Admin sidebar and editor were checked at phone widths by automated tests only, not on real phones.
- Easypaisa merchant integration, Urdu, customer email verification and multi-server rate limiting remain as listed in docs/LAUNCH_BLOCKERS.md.

---

## 3. Incident (disclosed)
While running browser tests, the test server connected to the **live Neon database** instead of a throwaway one, because `.env.local` holds the real `DATABASE_URL` and the dev server loads it. The test setup step called the demo seed, which adds or resets DEMO products (published), DEMO categories, a `DEMO10` coupon, and **replaces the `shipping` setting with demo zones** ("Kamoki (demo)", "Punjab (demo)"). The public site currently shows these. It is not known from outside whether they were there before. No orders, accounts or advance rules were created by that run.

**Fixed so it cannot recur:** the browser-test config now forces `DATABASE_URL` empty, and the demo seed refuses to run whenever `DATABASE_URL` is set.

**Not done:** removing the DEMO products and restoring the real delivery zones. That edits live data and needs the owner's decision, ideally after a Neon backup. Options: (1) leave as is if it was already like this; (2) have it listed and cleaned item by item with confirmation; (3) restore the Neon branch to a time just before the run.
