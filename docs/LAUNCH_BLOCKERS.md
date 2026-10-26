# Launch blockers and owner actions

Nothing below can be invented by the developer. Until done, the site shows "to be confirmed" rather than guessing.

## Must provide before launch
| # | Item | Where it goes | Status |
|---|---|---|---|
| 1 | Official WhatsApp business number | Admin → Store settings | missing |
| 2 | Shop address, opening hours, Google Maps link and embed link | Store settings | missing |
| 3 | Real products: names, photos (https URLs), prices, stock, compatible phones, warranty wording | Admin → Products | missing |
| 4 | Delivery zones: cities, fees, free-delivery thresholds, COD yes/no, delivery times. Kamoki free delivery is only a proposal until you confirm it | Admin → Shipping | demo values only |
| 5 | Return, refund and warranty terms (return window, conditions) and approval of the draft policy pages | Store settings → Policy specifics, then tick "approved" | draft |
| 6 | Which repairs you really offer | Store settings → Repair services | empty |
| 7 | Bank account details if bank transfer is offered | Store settings | empty |
| 8 | Official social profile links | Store settings | empty |
| 8b | Contact email address (shown to customers and used for new-order/repair/message alerts) | Store settings | empty |
| 9 | Founder section: Ali Hassan's approved message and photo (optional; hidden by default) | Store settings | off |
| 10 | Review and edit the four starter guides before publishing | Admin → Blog | drafts |
| 11 | Domain: fixit.com / fixitkamoki.com availability was **not verified**; buy and point DNS | registrar + host | unverified |

| 3b | **Real photographs per finish and angle** (consistent angle, light, background; see PRODUCT_PHOTOGRAPHY_GUIDE.md). The demo pictures are labelled placeholders | Admin → Products (image links) | missing |
| 3c | For products sold in colours: one product per finish with the same name + finish group, finish name and swatch colour | Admin → Products → Finish / colour | not entered |

## Accounts and money decisions
| # | Item | Notes |
|---|---|---|
| 12 | **Paid** hosting for the app | Vercel Hobby is non-commercial only, so the live shop needs Pro or another paid host (see DECISION_LOG §5). |
| 13 | **Paid, backed-up** Postgres | Supabase Free pauses after a week and has no backups; use Pro/Neon paid. |
| 14 | Resend account + verified sending domain | Free: 100/day, 3,000/month. Set `RESEND_API_KEY`, `EMAIL_FROM`. |
| 15 | Online payment gateway (optional) | Safepay and JazzCash adapters are built but **not yet run against a live merchant account**: you need the merchant account and sandbox credentials, then the staff test in Admin -> Payments (GO_LIVE_GUIDE section 4). Easypaisa is not built (needs its merchant guide). |
| 16 | Courier arrangements | No courier API is integrated; delivery fees are configured manually. |
| 17 | `TWO_FACTOR_KEY` server setting (32+ random characters) | Switches on two-step sign-in for staff (Admin → Account security). Keep it safe: if it changes, enrolled staff must set up again. Then **owner and every staff member should enrol**. |
| 18 | Cloudinary account + three `CLOUDINARY_*` settings | Enables photo and turntable upload in admin. Without it you can still paste https links. |
| 19 | Real turntable photos (24 to 36 frames per product that should have a 360° view) | Optional. See GO_LIVE_GUIDE section 5. |
| 20 | Real-phone pass on iPhone Safari and Android Chrome | Checklist in GO_LIVE_GUIDE section 6. |

## Not built (known gaps)
- Easypaisa gateway adapter (needs Easypaisa's Merchant Integration Guide). Refunds are made in each provider's own dashboard, then marked on the order.
- A/B testing: not run; traffic would be too low to read. Use Admin → Funnel as the baseline.
- Manual checks still owed: real phones (iOS Safari, Android Chrome) for dynamic toolbars, notches, keyboards and touch feel; a low-end-phone performance pass; a screen-reader pass; a design review of the finished look with real photos.
- Marketing email campaigns (the consented list and CSV export exist). Back-in-stock alerts are built (one transactional email per request).
- Customer email verification. (Staff two-step sign-in is built but optional and off until `TWO_FACTOR_KEY` is set and people enrol; it is not enforced.)
- Shared (multi-instance) rate limiting.
- Urdu / Roman Urdu (structure allows it later).
- Courier tracking integration, loyalty points, referral rewards.
- Performance measured only as lab numbers on the build machine; INP not measured; no real-phone or live-site measurement yet.

## Operational notes
- Run the app behind a proxy/host that sets `X-Real-IP` or appends to `X-Forwarded-For` (Vercel, Cloudflare, nginx) so rate limits cannot be dodged.
- Rate limits are per server instance; use a shared store if you run several instances.
- Check Admin → Messages and Orders regularly, or set the contact email so alerts reach you.

## Verified-in-code launch safety
Orders cannot be placed without configured delivery zones. Gateways never appear. The dev seed and test helper endpoints return 404 in production. `robots.txt` blocks everything while `NEXT_PUBLIC_DEMO_MODE=1`.
