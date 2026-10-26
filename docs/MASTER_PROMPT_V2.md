# FIXIT — MASTER PROMPT ADDENDUM V2 (saved verbatim in structure; V1 summary is MASTER_PROMPT_SUMMARY.md)
## Mobile-first conversion psychology, realism, morphism and retention

This extends the V1 master prompt. It does not replace the V1 architecture, functionality, security, testing or deployment requirements. Traceability of every item below is in [V2_REQUIREMENTS_CHECKLIST.md](V2_REQUIREMENTS_CHECKLIST.md).

## 1. Confirmed design direction
Primary language: **Liquid Glass + Titanium**, combined selectively with holographic tech accents, tactile skeuomorphic interactions, realistic hardware photography, restrained cinematic lighting, subtle depth/layered surfaces, fast accessible micro-interactions. Must not look like a generic AI dashboard; should resemble an art-directed consumer-electronics brand with believable products, consistent materials, deliberate spacing, strong hierarchy.

## 2. Mobile-first is non-negotiable
Test widths: 320 (stress), 360, 375–393, 414+. These are testing widths, not universal sizes; validate in real browsers, dynamic browser controls, safe areas.
A phone-frame **design-review preview** (not the production site): realistic device frame, compact status bar + top inset, independently scrollable viewport, visible bottom safe area / home indicator, sticky mobile purchase action where appropriate, interaction test controls, compact vs standard width comparison. Production renders at the customer's real width. No horizontal overflow, tiny text, cramped buttons or desktop two-column product layouts on narrow screens.

## 3. Mobile product page order
1 compact brand header with search + cart; 2 short breadcrumb/category; 3 product image showcase (restrained Liquid Glass); 4 small gallery/view controls; 5 name + concise description; 6 price + verified availability; 7 finish/variant selection; 8 compatibility + key specs; 9 prominent Add to Cart; 10 delivery, returns, warranty; 11 expandable detailed specs; 12 related + compatible products; 13 buying advice + customer support.
Single column, image near top. Compact purchase bar near the bottom: must not cover form fields, obscure content or conflict with safe areas. Mandatory options must be chosen before adding to cart. Cart action immediately responsive with clear confirmation and a choice to continue shopping or open the cart.

## 4. Psychological design principles
A Immediate understanding (concise value proposition, Shop Accessories + Book a Repair). B Reduced decision effort (recognisable categories, readable prices, meaningful filters, compatibility guidance, clear comparisons; avoid competing CTAs). C Confidence before purchase (verified specs, real inventory, transparent delivery charges, genuine contact info, approved policies; **never invent** reviews, sales numbers, scarcity, discounts, ratings, guarantees). D Responsive interaction (button compression, finish transitions, image highlights, cart feedback, skeletons, smooth drawers; every animation reinforces a real interaction). E Useful reasons to return (recently viewed, persistent cart, compatible accessories, order tracking, guides, repair support, optional consent-based updates; utility over manipulation).

## 5. Visual effects and motion
One coherent system. Liquid Glass: translucent nav, restrained blur, fine borders, layered panels, smooth cart/filter drawers. Titanium + tactile: metallic gradients, controlled reflections, precise highlights, pressed states; no low-contrast neumorphism for essential text/buttons. Holographic: selective cyan/blue/violet, restrained spectral gradients, short light sweeps on featured imagery; no full-interface neon.
Signature animations: (1) Titanium Spotlight — subtle tilt on desktop, static/gentle on mobile; (2) Liquid Glass Reveal — smooth enter/exit for nav overlays, filters, cart drawers; (3) Tactile Purchase Response — press, clear confirmation, smooth cart indicator update. CSS for simple, a motion library for complex. Respect reduced motion, no needless continuous animation, test on low-power devices.

## 6. Realism and product imagery
Use real photographs or approved accurate renders. Consistent shape, ports, logos, colour/finish, lighting direction, shadows, camera angle, included accessories. Generated concept art is not an accurate depiction unless verified. No colour selector that only changes a label: production uses real image variants per colour and gallery angle. Genuine 3D rotation only when quality/performance/maintenance justify.

## 7. Homepage order (mobile)
1 compact nav + search; 2 value proposition; 3 Shop Accessories + Book a Repair; 4 focused featured product/category visual; 5 popular categories (actual inventory + interest); 6 featured products with accurate prices; 7 repair services + booking path; 8 delivery + support; 9 genuine reviews/trust evidence when available; 10 buying guides; 11 contact, location, footer. Not everything above the fold.

## 8. Checkout and conversion
Guest checkout stays. Minimal fields, explain why essential info is needed. Show subtotal, shipping when known, final payable before commit; never hide a fee. COD only if fulfillable. Clear progress + errors; keep valid input after correctable errors. No fake payment success; never claim an order was placed when the backend failed.

## 9. Retention without manipulation (priority order)
1 reliable cart persistence; 2 order confirmation + tracking; 3 compatible accessory recommendations; 4 recently viewed; 5 post-purchase assistance; 6 repair/maintenance guides; 7 optional marketing subscriptions with recorded consent; 8 wishlist + accounts when justified. No fake countdowns/scarcity, preselected consent, misleading discounts, or obstructive unsubscribe.

## 10. Measurement and testing
Baseline + track: listing→detail engagement, detail→add-to-cart, cart→checkout initiation, checkout completion, mobile form errors, order cancellation, repeat purchase, repair inquiry conversion. Privacy-conscious analytics, no fabricated metrics; controlled experiments only with enough traffic; no unmeasured conversion claims. Test mobile widths, keyboard, touch, reduced motion, slow connections, realistic imagery.

## 11. Workflow
Inspect current implementation first; then: refine tokens/components → mobile product page → mobile homepage + category listing → cart + checkout layouts → shared motion system → connect to real data/server operations → test and fix each stage → responsive, a11y, performance, functional, regression checks → update docs, report blockers. Do not rebuild working functionality. Do not stop at mockups: implement in the real repository. Distinguish prototype interactions, implemented features, configured integrations, verified production behaviour. At completion report actual changes, tests run, outstanding issues, owner configuration still required.
